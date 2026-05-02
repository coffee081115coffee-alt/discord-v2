// 1. 基礎模組引入
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Datastore = require('@seald-io/nedb'); // 確保你安裝的是這個版本

// --- 2. Node.js 版本相容性修補 (防禦 TypeError: util.isDate) ---
const util = require('util');
if (!util.isDate) {
    util.isDate = (obj) => Object.prototype.toString.call(obj) === '[object Date]';
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 3. 資料庫初始化
const db = new Datastore({ filename: 'messages.db', autoload: true });
db.persistence.setAutocompactionInterval(5000); // 每 5 秒自動整理存檔

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// 4. 在線人數統計變數
let onlineCount = 0;

// 5. Socket 連線邏輯
io.on('connection', (socket) => {
    // 【人數增加】
    onlineCount++;
    io.emit('update count', onlineCount);
    console.log(`有人連線了！目前在線人數: ${onlineCount}`);

    // 【載入歷史紀錄】有人進來就給他舊訊息
    db.find({}).sort({ timestamp: 1 }).exec((err, docs) => {
        if (!err) {
            socket.emit('load history', docs);
        }
    });

    // 【接收新訊息】(文字或圖片)
    socket.on('chat message', (data) => {
        const now = new Date();
        data.timestamp = now.getTime();
        data.timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        // 存入資料庫
        db.insert(data, (err, newDoc) => {
            if (!err) {
                console.log('✅ 訊息存入成功');
                io.emit('chat message', newDoc); // 廣播給所有人
            } else {
                console.error('❌ 存檔失敗:', err);
            }
        });
    });

    // 【刪除訊息邏輯】
    socket.on('delete message', (id) => {
        console.log('收到刪除請求，ID:', id);
        db.remove({ _id: id }, {}, (err, numRemoved) => {
            if (!err) {
                console.log(`✅ 成功刪除 ${numRemoved} 則訊息`);
                io.emit('message deleted'); // 通知所有人重新載入
            } else {
                console.error('❌ 刪除失敗:', err);
            }
        });
    });

    // 【處理正在輸入】
    socket.on('typing', (name) => {
        socket.broadcast.emit('user typing', name);
    });

    // 【處理斷線】
    socket.on('disconnect', () => {
        onlineCount--;
        io.emit('update count', onlineCount);
        console.log(`有人離開了。剩餘人數: ${onlineCount}`);
    });
});

// 6. 啟動伺服器
// 修改啟動伺服器的部分
const PORT = process.env.PORT || 3000; // 如果雲端有給 PORT 就用雲端的，沒有就用 3000
server.listen(PORT, () => {
    console.log(`🚀 伺服器已在端口 ${PORT} 啟動`);
});