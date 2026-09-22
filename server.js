const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Helper function to format seconds to MM:SS
const formatDuration = (seconds) => {
    if (!seconds) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// --- Supported Sources API ---
app.get('/api/supported-sources', (req, res) => {
    res.json([
        { name: 'YouTube', types: 'Video, Audio', status: 'Supported' },
        { name: 'Facebook', types: 'Video', status: 'Supported' },
        { name: 'Instagram', types: 'Video, Reels', status: 'Supported' },
        { name: 'Twitter / X', types: 'Video', status: 'Supported' }
    ]);
});

// --- Analyze API ---
app.post('/api/analyze', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        console.log(`Analyzing: ${url}`);
        const info = await youtubedl(url, {
            dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true,
            noCheckCertificate: true,
            preferFreeFormats: true,
            youtubeSkipDashManifest: true,
        });

        const videoFormats = [];
        const audioFormats = [];

        if (info.formats) {
            info.formats.forEach(f => {
                if (f.vcodec !== 'none' && f.acodec !== 'none') {
                    videoFormats.push({
                        res: f.format_note || `${f.height}p`,
                        ext: f.ext,
                        size: f.filesize ? (f.filesize / (1024 * 1024)).toFixed(1) + ' MB' : 'Unknown',
                        id: f.format_id
                    });
                } else if (f.vcodec === 'none' && f.acodec !== 'none') {
                    audioFormats.push({
                        quality: f.abr ? `${f.abr} kbps` : 'Audio',
                        ext: f.ext,
                        size: f.filesize ? (f.filesize / (1024 * 1024)).toFixed(1) + ' MB' : 'Unknown',
                        id: f.format_id
                    });
                }
            });
        }

        const data = {
            id: info.id || 'vid_' + Date.now(),
            url: url,
            title: info.title || 'Untitled Media',
            author: info.uploader || 'Unknown Creator',
            duration: formatDuration(info.duration),
            views: info.view_count ? info.view_count.toLocaleString() + ' views' : 'N/A',
            type: 'Video',
            thumbnail: info.thumbnail || '',
            videoFormats: videoFormats.length > 0 ? videoFormats : [{ res: '720p', ext: 'mp4', size: 'Unknown', id: 'best' }],
            audioFormats: audioFormats.length > 0 ? audioFormats : [{ quality: '128 kbps', ext: 'mp3', size: 'Unknown', id: 'bestaudio' }],
            thumbnails: info.thumbnails ? info.thumbnails.map((t, i) => ({
                res: t.resolution || `Thumb ${i + 1}`,
                url: t.url,
                id: `t_${i}`
            })).reverse().slice(0, 5) : [],
            subtitles: []
        };

        res.json(data);
    } catch (error) {
        console.error('Analyze error:', error);
        res.status(500).json({ error: 'Failed to analyze media' });
    }
});

// --- Download API ---
app.get('/api/download', (req, res) => {
    const { url, formatId, title, ext } = req.query;
    if (!url || !formatId) return res.status(400).send('Missing url or formatId');

    const cleanTitle = (title || 'download').replace(/[/\\?%*:|"<>]/g, '_');
    const fileName = `${cleanTitle}.${ext || 'mp4'}`;
    
    res.header('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    console.log(`Downloading: ${url} (Format: ${formatId})`);

    try {
        const subprocess = youtubedl.exec(url, {
            format: formatId,
            output: '-',
            noWarnings: true
        });

        subprocess.stdout.pipe(res);

        subprocess.on('error', (err) => {
            console.error('Download error:', err);
            if (!res.headersSent) res.status(500).send('Download failed');
        });
    } catch (err) {
        console.error('Subprocess error:', err);
        if (!res.headersSent) res.status(500).send('Download failed');
    }
});

app.listen(PORT, () => {
    console.log(`Nexus YT Backend running on port ${PORT}`);
});
              
