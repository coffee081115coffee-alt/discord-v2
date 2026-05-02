const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const Datastore = require('@seald-io/nedb');
const db = new Datastore({ filename: 'messages.db', autoload: true });

app.use(express.static(__dirname));

let onlineUsers = {}; 

io.on('connection', (socket) => {
    // 1. 加入頻道 (預設加入 '一般')
    socket.on('join channel', (channelName) => {
        socket.join(channelName);
        // 只傳送該頻道的歷史訊息
        db.find({ channel: channelName }).sort({ timestamp: 1 }).exec((err, docs) => {
            socket.emit('load history', docs);
        });
    });

    // 2. 設定個人資料 (暱稱 + 頭像)
    socket.on('set profile', (data) => {
        onlineUsers[socket.id] = {
            name: data.name || "無名氏",
            avatar: data.avatar || "https://cdn-icons-png.flaticon.com/512/149/149071.png"
        };
        io.emit('update users', Object.values(onlineUsers));
    });

    // 3. 傳送訊息 (包含頻道資訊)
    socket.on('chat message', (data) => {
        const msgData = {
            ...data,
            _id: Date.now().toString(),
            channel: data.channel || '一般', // 紀錄這則訊息屬於哪個頻道
            timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now()
        };
        db.insert(msgData);
        // 只廣播給在同一個頻道的人
        io.to(data.channel).emit('chat message', msgData);
    });

    socket.on('delete message', (id) => {
        db.remove({ _id: id }, {}, () => { io.emit('message deleted'); });
    });

    socket.on('disconnect', () => {
        delete onlineUsers[socket.id];
        io.emit('update users', Object.values(onlineUsers));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`🚀 Server running on ${PORT}`); });