require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Express and environment
const app = express();
const PORT = process.env.PORT || 3000;
const apiKey = process.env.GOOGLE_API_KEY;

if (!apiKey) {
  console.error('ERROR: Missing Google API key. Set GOOGLE_API_KEY in .env file');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

// Setup simplified file upload
const upload = multer({ 
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1000)}${path.extname(file.originalname)}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
});

// Middleware
app.use(express.json());

// Create uploads directory
fs.mkdir('uploads', { recursive: true })
  .then(() => console.log('✅ Uploads directory created/verified'))
  .catch(err => console.error('❌ Error creating uploads directory:', err));

  app.get('/', (req, res) => {
    console.log('Received health check request firsttttt');
  });

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('Received health check request');
  res.status(200).json({ status: 'ok', message: 'Pest diagnosis API is running' });
});

// Pest diagnosis endpoint
app.post('/api/diagnose-pest', upload.single('image'), async (req, res) => {
  console.log('Received request to diagnose pest');
  console.log('Request body:', req.body);
  console.log('Request file:', req.file);
  console.log('Request file path:', req.file ? req.file.path : 'No file uploaded');
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No image uploaded' });
  }

  try {
    const filePath = req.file.path;
    
    // Pest diagnosis prompt
    const prompt = `Analyze this plant image for pest infestations or diseases. Answer in JSON format with the following structure:
{
  "diagnosis": {
    "hasPests": true|false,
    "pestIdentified": "Common name of pest (if any)",
    "scientificName": "Scientific name of pest (if any)",
    "severity": "low|medium|high",
    "affectedArea": "which part of plant is affected",
    "symptoms": ["list", "of", "visible", "symptoms"]
  },
  "damage": {
    "description": "Description of damage to plant",
    "progressStage": "early|moderate|advanced",
    "affectedParts": ["list", "of", "affected", "plant", "parts"]
  },
  "treatment": {
    "organic": ["list", "of", "organic", "treatments"],
    "chemical": ["list", "of", "chemical", "treatments"],
    "cultural": ["list", "of", "cultural", "practices"],
    "urgency": "low|medium|high"
  },
  "prevention": ["list", "of", "preventative", "measures"],
  "notes": "Additional observations or recommendations"
}
If no pests are visible, set hasPests to false and provide general plant health assessment in the notes section.`;

    // Process the image
    const imageData = await fs.readFile(filePath);
    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
    
    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          { 
            inline_data: {
              mime_type: req.file.mimetype,
              data: imageData.toString('base64')
            }
          }
        ]
      }]
    });

    // Clean up uploaded file
    fs.unlink(filePath).catch(err => console.warn('Failed to delete temp file:', err));

    const responseText = result.response.text();
    
    // Extract and parse JSON from response
    const jsonRegex = /```json\s*([\s\S]*?)\s*```|```\s*([\s\S]*?)\s*```|(\{[\s\S]*\})/;
    const match = responseText.match(jsonRegex);
    
    try {
      const jsonStr = match ? (match[1] || match[2] || match[3] || '') : responseText;
      const diagnosisData = JSON.parse(jsonStr);
      res.status(200).json({ success: true, data: diagnosisData });
    } catch (jsonError) {
      res.status(200).json({
        success: true,
        data: {
          rawResponse: responseText,
          parsingError: "Could not parse structured data from AI response"
        }
      });
    }

  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to analyze image',
      message: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Pest diagnosis API running at http://localhost:${PORT}`);
  console.log(`👉 Test API health at: http://localhost:${PORT}/api/health`);
  console.log(`👉 Send POST requests to: http://localhost:${PORT}/api/diagnose-pest`);
});