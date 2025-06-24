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
            const { url } = req.query;
            if (!url) {
                return res.status(400).json({
                    status: false,
                    message: 'URL Required'
                });
            }
            
            const result = await spotifyDl(url);
            
            // Jika ingin mengembalikan audio langsung (stream)
            if (req.query.direct) {
                const audioResponse = await axios.get(result.audio, {
                    responseType: 'arraybuffer'
                });
                
                const buffer = Buffer.from(audioResponse.data);
                
                // Set header untuk audio/mpeg (bisa disesuaikan dengan format sebenarnya)
                res.writeHead(200, {
                    'Content-Type': 'audio/mpeg',
                    'Content-Length': buffer.length,
                    'Content-Disposition': `attachment; filename="${encodeURIComponent(result.title)}.mp3"`
                });
                
                return res.end(buffer);
            }
            
            // Jika ingin mengembalikan JSON dengan metadata
            res.status(200).json({
                status: true,
                result: {
                    ...result,
                    // Tambahkan informasi content type
                    contentType: 'audio/mpeg'
                }
            });
            
        } catch (error) {
            res.status(500).json({
                status: false,
                message: error.message
            });
        }
    });
};