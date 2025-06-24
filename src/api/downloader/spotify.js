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
        title: data.title.trim() || 'Unknown',
        author: data.artists.trim() || 'Unknown',
        duration: data.duration_ms ? duration : 'Unknown',
        thumbnail: data.cover.trim() || null,
        audio: result.data.link.trim()
      };
    }

    app.get('/downloader/spotify', async (req, res) => {
        try {
            const { url } = req.query;
            if (!url) {
                return res.status(400).json({
                    status: false,
                    message: 'URL Required'
                });
            }
            
            const request = await spotifyDl(url);
            const result = await axios.get(request.audio, {
                responseType: 'arraybuffer'
            });
                
            const audio = Buffer.from(result.data);
            res.writeHead(200, {
                'Content-Type': 'audio/ogg',
                'Content-Length': audio.length,
                'Content-Disposition': `attachment; filename="${request.title}.mp3"`
            });
                
            return res.end(audio);
        } catch (error) {
            res.status(500).json({
                status: false,
                message: error.message
            });
        }
    });
};