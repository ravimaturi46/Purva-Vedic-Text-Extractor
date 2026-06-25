import express from 'express';
import path from 'path';
import HTMLtoDOCX from 'html-to-docx';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Max payload limits for local export
  app.use(express.json({ limit: '50mb' }));

  app.post('/api/export-docx', async (req, res) => {
    try {
      const { html } = req.body;
      if (!html) {
          res.status(400).json({ error: 'No HTML content provided' });
          return;
      }

      const fileBuffer = await HTMLtoDOCX(html, null, {
          table: { row: { cantSplit: true } },
          footer: true,
          pageNumber: true,
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', 'attachment; filename="extracted_document.docx"');
      
      // @ts-ignore
      const bufferData = Buffer.from(fileBuffer);
      res.send(bufferData);
    } catch (error: any) {
      console.error('DOCX Export error:', error);
      res.status(500).json({ error: error.message || 'Error creating DOCX file' });
    }
  });

  app.post('/api/extract-text-gemini', async (req, res) => {
    try {
      const { fileData, mimeType, languages, userApiKey } = req.body;
      if (!fileData || !mimeType) {
        res.status(400).json({ error: 'No file data or mimeType provided' });
        return;
      }
      
      const apiKey = userApiKey;
      
      if (!apiKey) {
         res.status(400).json({ error: 'No API key provided. Please provide a Gemini API key.' });
         return;
      }
      
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      
      // Clean base64 if it has data URL prefix
      let base64Data = fileData;
      if (fileData.includes('base64,')) {
        base64Data = fileData.split('base64,')[1];
      }

      const promptString = `Extract all text from the provided document. The document may be in languages such as ${languages.join(', ')}. Preserve paragraph formatting, line breaks, and structure where possible. Please format the output using simple HTML tags like <p>, <br/>, <h4> for headers if any. Only output the HTML, do not wrap it in markdown code blocks.`;

      const documentPart = {
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        },
      };
      
      const textPart = {
        text: promptString,
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: { parts: [documentPart, textPart] },
        config: {
          systemInstruction: "You are an expert OCR and document digitization system. You precisely extract text, preserving formatting and layout using HTML tags. You handle difficult, historical, or non-OCR compatible scans (like Vedic Sanskrit or Telugu) accurately."
        }
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error('Gemini extraction error:', error);
      res.status(500).json({ error: error.message || 'Error extracting text with Gemini' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
