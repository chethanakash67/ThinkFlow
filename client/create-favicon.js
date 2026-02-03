const sharp = require('sharp');
const path = require('path');

async function createCircularFavicon() {
  const inputPath = path.join(__dirname, 'public', 'assets', 'logo.jpeg');
  const outputPath = path.join(__dirname, 'public', 'favicon.png');
  
  const size = 256;
  const radius = size / 2;

  try {
    // Create a circular mask
    const circleSvg = Buffer.from(
      `<svg width="${size}" height="${size}">
        <circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/>
      </svg>`
    );

    // Process the image
    await sharp(inputPath)
      .resize(size, size, { fit: 'cover' })
      .composite([
        {
          input: circleSvg,
          blend: 'dest-in'
        }
      ])
      .png()
      .toFile(outputPath);

    console.log('✅ Circular favicon created successfully at:', outputPath);
  } catch (error) {
    console.error('❌ Error creating circular favicon:', error.message);
  }
}

createCircularFavicon();
