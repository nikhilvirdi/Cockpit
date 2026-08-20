const http = require('http');
const handleRoute = require('./routes')

// creating an http server

const server = http.createServer((req,res)=>{
    
    console.log('Method:', req.method);
    console.log('URL:', req.url)
    handleRoute(req,res);
    
});

server.listen(4000, ()=>{
    console.log('Cockpit server Running at http://localhost:4000')
});
