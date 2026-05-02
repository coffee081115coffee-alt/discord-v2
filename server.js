const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const Datastore = require('@seald-io/nedb');
const db = new Datastore({ filename: 'messages.db', autoload: true });

app.use(express.static(__dirname));

// --- 新增：記錄在線用戶 ---
let onlineUsers = {}; 

io.on('connection', (socket) => {
    // --- 新增：處理刪除訊息 ---
    socket.on('delete message', (id) => {
        console.log('準備刪除訊息 ID:', id);
        // 從資料庫中刪除
        db.remove({ _id: id }, {}, (err, numRemoved) => {
            if (err) {
                console.error('刪除失敗:', err);
            } else {
                console.log('成功從資料庫刪除:', numRemoved, '條訊息');
                // 通知所有人「訊息已刪除」，讓大家網頁自動重新整理
                io.emit('message deleted');
            }
        });
    });
    
    console.log('一位使用者連線了');

    // 當用戶設定暱稱時
    socket.on('set nickname', (name) => {
        onlineUsers[socket.id] = name || "無名氏";
        io.emit('update users', Object.values(onlineUsers)); // 廣播給所有人最新名單
    });

    db.find({}).sort({ timestamp: 1 }).exec((err, docs) => {
        socket.emit('load history', docs);
    });

    socket.on('chat message', (data) => {
        const msgData = {
            ...data,
            _id: Date.now().toString(),
            timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now()
        };
        db.insert(msgData);
        io.emit('chat message', msgData);
    });

    socket.on('disconnect', () => {
        delete onlineUsers[socket.id]; // 移除離開的人
        io.emit('update users', Object.values(onlineUsers));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 伺服器已在端口 ${PORT} 啟動`);
});