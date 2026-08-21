const getSystemInfo = require('../services/system');

function handleApiRoute(req,res){
    if(req.method === 'GET' && req.url === '/api/system'){
        const systemInfo = getSystemInfo();
        res.writeHead(200,{
            'Content-Type' : 'application/json'
        });
        res.end(JSON.stringify(systemInfo));
        return;
    }

    if(req.method === 'GET' && req.url === '/api/status'){
        res.writeHead(200,{
            'Content-Type' : 'application/json'
        });
        res.end(JSON.stringify({
            status : 'running'
        }));
        return;
    }

    if(req.method === 'POST' && req.url === '/api/test'){
        let body = '';
        req.on('data', (chunk)=>{
            body += chunk;
        });
        req.on('end',()=>{
            try{
                const data = JSON.parse(body);
                console.log('Received Data:', data);
                res.writeHead(200,{
                    'Content-Type' : 'application/json'
                });
                res.end(JSON.stringify({
                    message : 'Data Received',
                    data : data
                }));
            }
            catch(error){
                res.writeHead(400,{
                    'Content-Type' : 'application/json'
                });
                res.end(JSON.stringify({
                    error : 'Invalid JSON'
                }));
            }
        });
        return;
    }
    res.writeHead(404,{
        'Content-Type' : 'application/json'
    });
    res.end(JSON.stringify({
        error: 'API route not found'
    }));
}

module.exports = handleApiRoute;


