const axios = require('axios');

module.exports = function(app) {
    async function spotifyDl(url) {
      const { data } = await axios.post('https://spotiydownloader.com/api/metainfo', { url }, {
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://spotiydownloader.com',
          'Referer': 'https://spotiydownloader.com/id',
          'User-Agent': 'Mozilla/5.0'
        }
      });

      const result = await axios.post('https://spotiydownloader.com/api/download', { id: data.id }, {
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://spotiydownloader.com',
          'Referer': 'https://spotiydownloader.com/id',
          'User-Agent': 'Mozilla/5.0'
        }
      });
    
      const totalSeconds = Math.floor(data.duration_ms / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      return {
        title: data.title || 'Unknown',
        author: data.artists || 'Unknown',
        duration: data.duration_ms ? duration : 'Unknown',
        thumbnail: data.cover || null,
        audio: result.data.link
      };
    }

    app.get('/downloader/spotify', async (req, res) => {
        try {
            const {
                url,
                apikey
            } = req.query;
            const { data } = await axios.get('https://iceflow.biz.id/src/routes.json');
            if (!url) {
                res.status(400).json({
                    status: false,
                    message: 'URL Required'
                });
            } else if (!apikey) {
                res.status(400).json({
                    status: false,
                    message: 'Apikey Required'
                });
            } else if (apikey !== data.apiSettings.apikey[0]) {
                res.status(400).json({
                    status: false,
                    message: 'Apikey Invalid'
                });
            }
            
            const request = await spotifyDl(url);
            const response = await axios.get(request.audio, {
                responseType: 'arraybuffer'
            });
                
            const aud = Buffer.from(result.data);
            res.writeHead(200, {
                'Content-Type': 'audio/mpeg',
                'Content-Length': aud.length,
                'Content-Disposition': `attachment; filename="${response.title}.mp3"`
            });
            res.end(aud);
        } catch (error) {
            console.error('Error in /downloader/spotify route:', error);
            res.status(500).json({
                status: false,
                message: error.message
            });
        }
    });
};
