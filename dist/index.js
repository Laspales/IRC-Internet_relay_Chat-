"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const body_parser_1 = __importDefault(require("body-parser"));
const db_1 = require("./db");
const express_session_1 = __importDefault(require("express-session"));
const socket_io_1 = require("socket.io");
;
;
;
const session = (0, express_session_1.default)({
    secret: "verysecret",
    resave: false,
    saveUninitialized: true,
    cookie: {}
});
const app = (0, express_1.default)();
const httpServer = http_1.default.createServer(app);
const io = new socket_io_1.Server(httpServer);
const wrapper = (middleware) => (socket, next) => middleware(socket.request, {}, next);
io.use(wrapper(session));
const jsonParser = body_parser_1.default.json();
const urlencodedParser = body_parser_1.default.urlencoded({ extended: true });
app.use(jsonParser);
app.use(urlencodedParser);
app.use(session);
app.get('/', (req, res) => {
    if (req.session.user) {
        res.sendFile(__dirname + "/html/user.html");
    }
    else {
        res.sendFile(__dirname + "/html/index.html");
    }
});
app.get("/login", (req, res) => {
    res.sendFile(__dirname + "/html/login.html");
});
app.get("/user", (req, res) => {
    if (req.session.user) {
        res.sendFile(__dirname + "/html/user.html");
    }
    else {
        res.redirect("/login");
    }
});
app.post("/login", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    if (username && password) {
        const query = "SELECT * FROM users WHERE username = ?";
        db_1.db.query(query, username, (error, result) => {
            if (error) {
                console.log(error);
                res.send("user not found");
            }
            else {
                console.log("user found");
                const data = result;
                req.session.user = {
                    id: data[0].id,
                    username: data[0].username
                };
                console.log(result);
                res.redirect("/user");
            }
        });
    }
    else {
        console.log("no username or password");
        res.send("no username or password");
    }
});
app.get("/chat", (req, res) => {
    console.log(__dirname + "/html/chat.html");
    if (req.session.user) {
        res.sendFile(__dirname + "/html/chat.html");
    }
    else {
        res.redirect("/login");
    }
});
io.on('connection', (defaultSocket) => {
    const socket = defaultSocket;
    const userSession = socket.request.session.user;
    const getMessagesQuery = "SELECT * FROM messages";
    if (userSession) {
        console.log((userSession === null || userSession === void 0 ? void 0 : userSession.username) + ' is connected');
        db_1.db.query(getMessagesQuery, (error, result) => {
            if (error) {
                console.log(error);
            }
            else {
                const data = result;
                data.forEach((message) => {
                    const query = "SELECT * FROM users WHERE id = ?";
                    db_1.db.query(query, message.sender_id, (error, result) => {
                        if (error) {
                            console.log(error);
                        }
                        else {
                            const data = result;
                            const sender = data[0].username;
                            socket.emit('chat message', sender + " : " + message.content);
                        }
                    });
                });
            }
        });
        ///////////////////////////////////////////MESSAGE///////////////////////////////////////////
        socket.on('chat message', (msg) => {
            console.log("chat message : " + msg);
            const query = "INSERT INTO messages (sender_id, content) VALUES (?, ?)";
            db_1.db.query(query, [userSession.id, msg], (error, result) => {
                if (error) {
                    console.log(error);
                }
                else {
                    console.log(result);
                }
            });
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
        }
        else {
            res.redirect("/");
        }
    });
});
app.set('view engine', 'ejs'); // We'll use EJS for rendering HTML
// Define a route to handle URLs with an ID parameter
app.get('/room/:id', (req, res) => {
    const id = req.params.id;
    res.render('room', { id });
});
app.post('/create-room', (req, res) => {
    const checkRoomNumber = (roomNumber) => {
        const query = 'SELECT room_number FROM room WHERE room_number = ?';
        db_1.db.query(query, roomNumber, (err, results) => {
            if (err) {
                res.status(500).send('Database error');
                console.log(err);
            }
            else if (Array.isArray(results) && results.length > 0) {
                checkRoomNumber(roomNumber + 1);
            }
            else {
                const insertQuery = 'INSERT INTO room (room_number, room_creator) VALUES (?, ?)';
                const roomCreator = req.session.user;
                db_1.db.query(insertQuery, [roomNumber, roomCreator === null || roomCreator === void 0 ? void 0 : roomCreator.id], (insertErr, insertResults) => {
                    if (insertErr) {
                        res.status(500).send('Database error');
                        console.log(insertErr);
                    }
                    else {
                        const checkRoomNumberQuery = 'SELECT room_number FROM room WHERE room_number = ?';
                        db_1.db.query(checkRoomNumberQuery, roomNumber, (err, result) => {
                            console.log(result);
                            if (err) {
                                res.status(500).send('Database error');
                                console.log(err);
                            }
                            else if (Array.isArray(result) && result.length > 0) {
                                const roomId = result;
                                const newRoom = roomId[0].room_number;
                                const roommemberQuery = 'INSERT INTO roommembers (id_room, id_user) VALUES (?, ?)';
                                db_1.db.query(roommemberQuery, [newRoom, roomCreator === null || roomCreator === void 0 ? void 0 : roomCreator.id], (insertErr, insertResults) => {
                                    if (insertErr) {
                                        res.status(500).send('Database error');
                                        console.log(insertErr);
                                    }
                                    else {
                                        console.log("roommember inserted");
                                        res.redirect(`/room/${newRoom}`);
                                    }
                                });
                            }
                            else {
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
