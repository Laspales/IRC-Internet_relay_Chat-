import express from 'express';
import http, { IncomingMessage } from 'http';
import bodyParser from "body-parser";
import { db } from './db';
import expressSession, { SessionData } from "express-session";
import { RowDataPacket } from 'mysql2';
import { Server, Socket } from 'socket.io';

declare module 'express-session' {
    interface SessionData {
        user: { id: number, username: string };
    }
};

interface SessionIncomingMessage extends IncomingMessage {
    session: SessionData;
};

interface SessionSocket extends Socket {
    request: SessionIncomingMessage;
};

const session = expressSession({
    secret: "verysecret",
    resave: false,
    saveUninitialized: true,
    cookie: {}
});

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
const wrapper = (middleware: any) => (socket: Socket, next: any) => middleware(socket.request, {}, next);
io.use(wrapper(session));

const jsonParser = bodyParser.json();
const urlencodedParser = bodyParser.urlencoded({ extended: true });
app.use(jsonParser);
app.use(urlencodedParser);
app.use(session);

app.get('/', (req, res) => {
    if (req.session.user) {
        res.sendFile(__dirname + "/html/user.html");
    } else {
        res.sendFile(__dirname + "/html/index.html");
    }
});

app.get("/login", (req, res) => {
    res.sendFile(__dirname + "/html/login.html");
})

app.get("/user", (req, res) => {
    if (req.session.user) {
        res.sendFile(__dirname + "/html/user.html");
    } else {
        res.redirect("/login");
    }
})

app.post("/login", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    if (username && password) {
        const query = "SELECT * FROM users WHERE username = ?"
        db.query(query, username, (error, result) => {
            if (error) {
                console.log(error);
                res.send("user not found");
            } else {
                console.log("user found");
                const data = <RowDataPacket>result;
                req.session.user = {
                    id: data[0].id,
                    username: data[0].username
                }
                console.log(result);
                res.redirect("/user");
            }
        })
    } else {
        console.log("no username or password");
        res.send("no username or password");
    }
})

app.get("/chat", (req, res) => {
    console.log(__dirname + "/html/chat.html");
    if (req.session.user) {
        res.sendFile(__dirname + "/html/chat.html");
    } else {
        res.redirect("/login");
    }
})

io.on('connection', (defaultSocket: Socket) => {
    const socket = <SessionSocket>defaultSocket;
    const userSession = socket.request.session.user;
    const getMessagesQuery = "SELECT * FROM messages";
    if (userSession) {
        console.log(userSession?.username + ' is connected');
        db.query(getMessagesQuery, (error, result) => {
            if (error) {
                console.log(error);
            } else {
                const data = <RowDataPacket>result;
                data.forEach((message: any) => {
                    const query = "SELECT * FROM users WHERE id = ?";
                    db.query(query, message.sender_id, (error, result) => {
                        if (error) {
                            console.log(error);
                        } else {
                            const data = <RowDataPacket>result;
                            const sender = data[0].username;
                            socket.emit('chat message', sender + " : " + message.content);
                        }
                    })
                })
            }
        })
        ///////////////////////////////////////////MESSAGE///////////////////////////////////////////
        socket.on('chat message', (msg) => {
            console.log("chat message : " + msg);
            const query = "INSERT INTO messages (sender_id, content) VALUES (?, ?)";
            db.query(query, [userSession.id, msg], (error, result) => {
                if (error) {
                    console.log(error);
                } else {
                    console.log(result);
                }
            })
            io.emit('chat message', userSession.username + " : " + msg);
        });
        socket.on('disconnect', (reason) => {
            console.log(`${userSession.username} disconnected : `, reason);
        });
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.log(error);
        } else {
            res.redirect("/");
        }
    })
})

app.set('view engine', 'ejs'); // We'll use EJS for rendering HTML

// Define a route to handle URLs with an ID parameter
app.get('/room/:id', (req, res) => {
    const id = req.params.id;
    res.render('room', { id });
});

app.post('/create-room', (req, res) => {
    const checkRoomNumber = (roomNumber: number) => {
        const query = 'SELECT room_number FROM room WHERE room_number = ?';
        db.query(query, roomNumber, (err, results) => {
            if (err) {
                res.status(500).send('Database error');
                console.log(err);
            } else if (Array.isArray(results) && results.length > 0) {
                checkRoomNumber(roomNumber + 1);
            } else {
                const insertQuery = 'INSERT INTO room (room_number, room_creator) VALUES (?, ?)';
                const roomCreator = req.session.user;
                db.query(insertQuery, [roomNumber, roomCreator?.id], (insertErr, insertResults) => {
                    if (insertErr) {
                        res.status(500).send('Database error');
                        console.log(insertErr);
                    } else {
                        const checkRoomNumberQuery = 'SELECT room_number FROM room WHERE room_number = ?';
                        db.query(checkRoomNumberQuery, roomNumber, (err, result) => {
                            console.log(result);
                            if (err) {
                                res.status(500).send('Database error');
                                console.log(err);
                            } else if (Array.isArray(result) && result.length > 0) {
                                const roomId = <RowDataPacket>result;
                                const newRoom = roomId[0].room_number;
                                const roommemberQuery = 'INSERT INTO roommembers (id_room, id_user) VALUES (?, ?)';
                                db.query(roommemberQuery, [newRoom, roomCreator?.id], (insertErr, insertResults) => {
                                    if (insertErr) {
                                        res.status(500).send('Database error');
                                        console.log(insertErr);
                                    } else {
                                        console.log("roommember inserted");
                                        res.redirect(`/room/${newRoom}`);
                                    }
                                });
                            } else {
                                console.log(err);
                                res.send("error");
                            }
                        });
                    }
                });
            }
        });
    };
    const roomNumber = Number(req.body.roomNumber);
    checkRoomNumber(roomNumber + 1);
});

httpServer.listen(3000, () => {
    console.log(`Listening on port http://localhost:3000`);
});