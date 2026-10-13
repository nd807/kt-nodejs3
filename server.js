const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
});

const wss = new WebSocketServer({ server });
let nextId = 1;

function send(client, data) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(data));
  }
}

function broadcast(data) {
  for (const client of wss.clients) {
    if (client.name) send(client, data);
  }
}

function updateUsers() {
  const users = [];
  for (const client of wss.clients) {
    if (client.name) users.push({ id: client.id, name: client.name });
  }
  broadcast({ type: 'users', users });
}

wss.on('connection', client => {
  client.id = nextId++;

  client.on('message', message => {
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch {
      return;
    }
    if (!data || typeof data !== 'object') return;

    if (data.type === 'join' && !client.name) {
      if (typeof data.name !== 'string' || !data.name.trim()) return;

      const names = [];
      for (const user of wss.clients) {
        if (user.name) names.push(user.name);
      }

      client.name = data.name.trim().slice(0, 30);
      client.color = /^#[0-9a-f]{6}$/i.test(data.color) ? data.color : '#000000';
      send(client, { type: 'joined', id: client.id });
      send(client, {
        type: 'system',
        text: names.length
          ? 'Добро пожаловать. В чате уже присутствуют: ' + names.join(', ') + '.'
          : 'Добро пожаловать. Вы первый в чате.'
      });

      for (const user of wss.clients) {
        if (user.name && user !== client) {
          send(user, { type: 'system', text: 'К нам присоединился ' + client.name });
        }
      }
      updateUsers();
    }

    if (data.type === 'message' && client.name) {
      if (typeof data.text !== 'string' || !data.text.trim()) return;

      const result = {
        type: 'message',
        name: client.name,
        color: client.color,
        text: data.text.trim().slice(0, 1000)
      };

      if (data.to) {
        const receiver = [...wss.clients].find(user => user.id === Number(data.to) && user.name);
        if (!receiver) {
          send(client, { type: 'system', text: 'Пользователь уже вышел из чата.' });
          return;
        }
        result.private = true;
        result.to = receiver.name;
        send(receiver, result);
        if (receiver !== client) send(client, result);
      } else {
        broadcast(result);
      }
    }
  });

  client.on('error', () => {});

  client.on('close', () => {
    if (!client.name) return;
    broadcast({ type: 'system', text: client.name + ' нас покинул.' });
    updateUsers();
  });
});

server.listen(3000, '127.0.0.1', () => {
  console.log('Чат запущен: http://localhost:3000');
});
