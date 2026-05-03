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
    console.log('一位使用者連線了');

    // 1. 加入頻道
    socket.on('join channel', (channelName) => {
        socket.join(channelName);
        db.find({ channel: channelName }).sort({ timestamp: 1 }).exec((err, docs) => {
            socket.emit('load history', docs);
        });
    });

    // 2. 設定個人資料
    socket.on('set profile', (data) => {
        onlineUsers[socket.id] = {
            name: data.name || "無名氏",
            avatar: data.avatar || "https://cdn-icons-png.flaticon.com/512/149/149071.png"
        };
        io.emit('update users', Object.values(onlineUsers));
    });

    // 3. 傳送訊息
    socket.on('chat message', (data) => {
        const msgData = {
            ...data,
            _id: Date.now().toString(),
            channel: data.channel || '一般',
            timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now()
        };
        db.insert(msgData);
        io.to(data.channel).emit('chat message', msgData);
    });

    // 4. 刪除訊息 (修正：這裡把 ID 傳回去，前端才不會閃退)
    socket.on('delete message', (id) => {
        db.remove({ _id: id }, {}, (err, numRemoved) => {
            io.emit('message deleted', id); 
        });
    });

    // 5. 離線處理 (新增：不然線上人數會壞掉)
    socket.on('disconnect', () => {
        delete onlineUsers[socket.id];
        io.emit('update users', Object.values(onlineUsers));
        console.log('一位使用者離開了');
    });
}); // <--- 原本漏掉的這個花括號補回來了

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { 
    console.log(`🚀 Server running on port ${PORT}`); 
});