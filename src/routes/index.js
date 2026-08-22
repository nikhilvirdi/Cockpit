const fs = require('fs');
const path = require('path');
const handleApiRoute = require('./api');

function handleRoute(req,res){

    if(req.url.startsWith('/api')){
        handleApiRoute(req,res);
        return;
    }


    if(req.method === 'GET' && req.url === '/'){
        fs.readFile(path.resolve(__dirname, '../../public/index.html'), (error,data)=>{
            if(error){
                res.writeHead(500,{
                    'Content-Type' : 'text/plain'
                });
                res.end('Internal Server Error');
                return;
            }
            res.writeHead(200,{
                'Content-Type' : 'text/html'
            });
            res.end(data);
        });
        return;
    }

    if(req.method === 'GET' && req.url === '/about'){
        res.writeHead(200,
            {
                'Content-Type' : 'text/plain'
            }
        );
        res.end('Cockpit is a Local Developer Operations Dashboard');
        return;
    }

    const publicPath = path.resolve(__dirname, '../../public');
    const requestedPath = decodeURIComponent(req.url.slice(1));
    const filePath = path.resolve(publicPath, requestedPath);


    const relativePath = path.relative(publicPath, filePath);

    if(relativePath.startsWith('..') || path.isAbsolute(relativePath)){
        res.writeHead(403,{
            'Content-Type' : 'text/plain'
        });
        res.end('Forbidden');
        return;
    }

    const extension = path.extname(filePath);
    
    let contentType = 'text/plain';
    if(extension === '.css'){
        contentType = 'text/css';
    }
    else if(extension === '.js'){
        contentType = 'text/javascript';
    }
    else if(extension === '.html'){
        contentType = 'text/html';
    }

    console.log('File Path:', filePath);
    fs.readFile(filePath,(error,data)=>{
        if(error){
            res.writeHead(404,{
                'Content-Type' : 'text/plain'
            })
            res.end('Not Found');
            return;
        }
        res.writeHead(200,{
            'Content-Type' : contentType
        });
        res.end(data);
    });
    return;
}

module.exports = handleRoute;

