const http = require('http');
const net = require('net');
const dns = require('dns');

dns.setDefaultResultOrder('ipv4first');

const server = http.createServer();

server.on('connect', (req, clientSocket, head) => {
  const [hostname, port] = req.url.split(/:/);
  const serverSocket = net.connect(port || 443, hostname, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });
  serverSocket.on('error', (err) => {
    clientSocket.end();
  });
  clientSocket.on('error', (err) => {
    serverSocket.end();
  });
});

server.listen(8080, () => {
  console.log('Proxy running on port 8080');
});
