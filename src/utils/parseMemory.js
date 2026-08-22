function parseMemory(memory){
    return Number(
        memory.replace(/,/g,'').replace(' K','')
    );
}

module.exports = parseMemory;