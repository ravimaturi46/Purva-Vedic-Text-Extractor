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
