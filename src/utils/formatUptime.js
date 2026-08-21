function formatUptime(seconds){

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];

    if(days>0){
        parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);    }
    if(hours>0){
        parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    }
    if(minutes>0){
        parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);    }

    return parts.join(', ');
}

module.exports = formatUptime;