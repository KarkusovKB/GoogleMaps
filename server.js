const express = require('express');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));

// Inject API key into the HTML
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <!-- Your existing head content -->
        </head>
        <body>
            <!-- Your existing body content -->
            <script>
                window.GOOGLE_MAPS_API_KEY = "${process.env.GOOGLE_MAPS_API_KEY}";
            </script>
            <script>
                function loadGoogleMapsScript() {
                    const script = document.createElement('script');
                    script.src = \`https://maps.googleapis.com/maps/api/js?key=\${window.GOOGLE_MAPS_API_KEY}&libraries=places,geometry&callback=initMap\`;
                    script.async = true;
                    script.defer = true;
                    document.body.appendChild(script);
                }
                loadGoogleMapsScript();
            </script>
        </body>
        </html>
    `);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 