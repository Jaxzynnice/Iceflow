const axios = require('axios');

module.exports = function(app) {
    function msToMinutes(ms) {
      const totalSeconds = Math.floor(ms / 1000)
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      return `${minutes}:${seconds.toString().padStart(2, '0')}`
    }

    async function spotifyDl(url) {
      if (!url) throw new Error('where’s the url?')

      const metaResponse = await axios.post('https://spotiydownloader.com/api/metainfo', { url }, {
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://spotiydownloader.com',
          'Referer': 'https://spotiydownloader.com/id',
          'User-Agent': 'Mozilla/5.0'
        }
      })

      const meta = metaResponse.data
      if (!meta || !meta.success || !meta.id)
        throw new Error('fetching failed')

      const dlResponse = await axios.post('https://spotiydownloader.com/api/download', { id: meta.id }, {
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://spotiydownloader.com',
          'Referer': 'https://spotiydownloader.com/id',
          'User-Agent': 'Mozilla/5.0'
        }
      })

      const result = dlResponse.data
      if (!result || !result.success || !result.link)
        throw new Error('fail to get url')

      return {
        title: meta.title || 'Unknown',
        author: meta.artists || 'Unknown',
        duration: meta.duration_ms ? msToMinutes(meta.duration_ms) : 'Unknown',
        thumbnail: meta.cover || null,
        audio: result.link
      }
    }

    app.get('/downloader/spotify', async (req, res) => {
        try {
            const {
                url
            } = req.query;
            if (!url) {
                return res.status(400).json({
                    status: false,
                    message: 'URL Required'
                });
            }
            const result = await spotifyDl(url);
            res.status(200).json({
                status: true,
                result
            });
        } catch (error) {
            res.status(500).json({
                status: false,
                message: error.message
            });
        }
    });
};