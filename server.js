const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Root Route
app.get('/', (req, res) => {
    res.send('Nexus YT Backend is Live!');
});

// Analyze Media Route using yt-dlp
app.post('/api/analyze', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const ytdlp = spawn('yt-dlp', ['--dump-json', '--no-warnings', url]);
        let dataString = '';
        let errorString = '';

        ytdlp.stdout.on('data', (data) => {
            dataString += data.toString();
        });

        ytdlp.stderr.on('data', (data) => {
            errorString += data.toString();
        });

        ytdlp.on('close', (code) => {
            if (code !== 0 || !dataString) {
                console.error(`yt-dlp error: ${errorString}`);
                return res.status(500).json({ error: 'Failed to extract media info' });
            }

            try {
                const info = JSON.parse(dataString);
                
                // Format response for frontend
                const mediaData = {
                    id: info.id || 'vid_' + Date.now(),
                    url: url,
                    title: info.title || 'Unknown Title',
                    author: info.uploader || info.channel || 'Unknown Author',
                    duration: formatDuration(info.duration),
                    views: info.view_count ? `${info.view_count.toLocaleString()} views` : 'Views unavailable',
                    type: 'Video',
                    thumbnail: info.thumbnail || '',
                    videoFormats: (info.formats || [])
                        .filter(f => f.vcodec !== 'none' && f.acodec !== 'none' && f.height)
                        .map(f => ({
                            id: f.format_id,
                            res: `${f.height}p`,
                            ext: f.ext || 'mp4',
                            size: f.filesize ? (f.filesize / (1024*1024)).toFixed(1) + ' MB' : 'Varies'
                        })),
                    audioFormats: [
                        { id: 'bestaudio', quality: '128 kbps', ext: 'm4a', size: 'Approx. 5 MB' }
                    ],
                    thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ res: t.id || 'Thumb', url: t.url, id: t.url })) : [],
                    subtitles: []
                };

                res.json(mediaData);
            } catch (parseError) {
                console.error('JSON Parse error:', parseError);
                res.status(500).json({ error: 'Internal server error during parsing' });
            }
        });
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Download Route
app.get('/api/download', (req, res) => {
    const { url, formatId } = req.query;
    if (!url) return res.status(400).send('URL is required');

    try {
        const args = ['-f', formatId || 'best', '-o', '-', url];
        const ytdlpProcess = spawn('yt-dlp', args);

        res.setHeader('Content-Disposition', 'attachment; filename="downloaded_media.mp4"');
        
        ytdlpProcess.stdout.pipe(res);

        ytdlpProcess.stderr.on('data', (data) => {
            console.error(`Download stderr: ${data}`);
        });

        ytdlpProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`Download process exited with code ${code}`);
            }
        });
    } catch (err) {
        console.error('Download route error:', err);
        res.status(500).send('Download failed');
    }
});

// Supported Sources Route
app.get('/api/supported-sources', (req, res) => {
    res.json([
        { name: 'YouTube', types: 'Video, Audio, Playlist', status: 'Active' },
        { name: 'Facebook', types: 'Video', status: 'Active' },
        { name: 'Instagram', types: 'Reels, Posts', status: 'Active' }
    ]);
});

function formatDuration(seconds) {
    if (!seconds) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
                                   
