const express = require('express');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Serve static files except index.html
app.use(express.static('public', {
    index: false
}));

// Serve index.html with injected API key
app.get('/', (req, res) => {
    fs.readFile(path.join(__dirname, 'public', 'index.html'), 'utf8', (err, html) => {
        if (err) {
            res.status(500).send('Error loading page');
            return;
        }
        
        // Replace placeholder with actual API key
        const finalHtml = html.replace('%GOOGLE_MAPS_API_KEY%', process.env.GOOGLE_MAPS_API_KEY);
        res.send(finalHtml);
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 