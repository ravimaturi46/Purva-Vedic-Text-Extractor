import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileText, ArrowRight, Download, Loader2, FileType2, Search, Zap } from 'lucide-react';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import Tesseract from 'tesseract.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const AVAILABLE_LANGUAGES = [
  { code: 'san', label: 'Sanskrit' },
  { code: 'hin', label: 'Hindi' },
  { code: 'eng', label: 'English' },
  { code: 'tel', label: 'Telugu' }
];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['tel']);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState<string>('');
  const [extractedHtml, setExtractedHtml] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const toggleLanguage = (code: string) => {
    setSelectedLanguages(prev => {
      if (prev.includes(code)) {
        if (prev.length === 1) return prev; // prevent empty selection
        return prev.filter(c => c !== code);
      }
      return [...prev, code];
    });
  };

  // Keep editor content synced with state
  const handleEditorInput = () => {
    if (editorRef.current) {
      setExtractedHtml(editorRef.current.innerHTML);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        setError('Please upload a valid PDF file.');
        return;
      }
      setFile(selectedFile);
      setFileUrl(URL.createObjectURL(selectedFile));
      setExtractedHtml(null);
      setError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      if (droppedFile.type !== 'application/pdf') {
        setError('Please upload a valid PDF file.');
        return;
      }
      setFile(droppedFile);
      setFileUrl(URL.createObjectURL(droppedFile));
      setExtractedHtml(null);
      setError(null);
    }
  };

  const triggerExtract = async () => {
    if (!file) return;
    
    setIsExtracting(true);
    setError(null);
    setExtractionStatus('Initializing Local OCR (0% cost)...');
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      
      let combinedHtml = '';

      const langString = selectedLanguages.join('+');
      const langNames = selectedLanguages.map(c => AVAILABLE_LANGUAGES.find(l => l.code === c)?.label).join(' & ');
      
      setExtractionStatus(`Loading ${langNames} language model...`);
      const worker = await Tesseract.createWorker(langString, 1, {
        logger: m => {
          // You can log m.status here if you want super fine-grained UI updates
        }
      });

      for (let i = 1; i <= numPages; i++) {
        setExtractionStatus(`Rendering Page ${i} of ${numPages}...`);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // High scale for clear text
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          // @ts-ignore
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          
          setExtractionStatus(`OCR Processing Page ${i} of ${numPages}...`);
          const { data: { text } } = await worker.recognize(canvas);
          
          // Re-format into paragraphs to maintain loose layout
          const formattedText = text.split('\n\n').map(p => `<p style="margin-bottom: 1em;">${p.replace(/\n/g, '<br/>')}</p>`).join('');
          
          combinedHtml += `<div style="padding-bottom: 1.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid #e2e8f0;">
            <h4 style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.1em; font-family: sans-serif;">Page ${i}</h4>
            ${formattedText}
          </div>`;
        }
      }
      
      await worker.terminate();
      setExtractedHtml(combinedHtml);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to extract text locally.');
    } finally {
      setIsExtracting(false);
      setExtractionStatus('');
    }
  };

  const triggerExport = async () => {
    if (!extractedHtml) return;
    
    setIsExporting(true);
    setError(null);
    
    try {
      const response = await fetch('/api/export-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ html: extractedHtml }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to export document');
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file ? file.name.replace('.pdf', '_extracted.docx') : 'extracted_document.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <header className="flex items-center justify-between px-8 py-4 border-b border-slate-200 bg-white shadow-sm z-20 relative">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm">
            <FileType2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-none text-slate-800 uppercase tracking-wider">Purva Vedic Text Extractor</h1>
            <p className="text-xs text-slate-500 font-medium mt-1">Multi-Language OCR</p>
          </div>
        </div>
        <div className="flex items-center space-x-6">
          <div className="flex text-xs font-bold text-slate-400 uppercase tracking-widest gap-1.5 items-center">
            <Search className="w-4 h-4" /> Layout Preserving Engine
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col xl:flex-row overflow-hidden w-full max-w-full">
        
        {/* LEFT PANE: PDF Uploader / Viewer */}
        <aside className="xl:w-[420px] 2xl:w-[480px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col p-6 overflow-y-auto z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
          <div className="mb-6 flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" /> Active Document
              </h2>
              {file && !isExtracting && (
                <button 
                  onClick={() => setFile(null)}
                  className="text-[10px] font-bold text-red-500 uppercase tracking-widest hover:text-red-700 transition"
                >
                  Clear
                </button>
              )}
            </div>
          
            <div className="flex flex-col gap-2">
               <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                 Languages to Extract
               </h3>
               <div className="flex flex-wrap gap-2">
                 {AVAILABLE_LANGUAGES.map(lang => (
                   <button
                     key={lang.code}
                     onClick={() => toggleLanguage(lang.code)}
                     className={cn(
                       "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors border",
                       selectedLanguages.includes(lang.code) 
                         ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm"
                         : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                     )}
                   >
                     {lang.label}
                   </button>
                 ))}
               </div>
            </div>
          </div>
          
          <div className="flex-1 flex flex-col overflow-hidden min-h-[400px]">
            {!file ? (
              <div 
                className={cn(
                  "p-8 bg-slate-50 border-2 border-dashed border-indigo-200 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors flex-1",
                  "hover:bg-indigo-50/50 group"
                )}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept=".pdf,application/pdf" 
                  className="hidden" 
                />
                <div className="w-12 h-12 bg-white shadow-sm flex items-center justify-center rounded mb-4 text-indigo-400 group-hover:text-indigo-600 transition-colors">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-700 mb-1">Upload Scanned PDF</p>
                <p className="text-xs text-slate-400 mt-1 text-center max-w-[200px]">
                  Drag & drop your file here, or click to browse
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col bg-slate-50 rounded-xl border border-slate-200 overflow-hidden relative shadow-inner">
                {fileUrl && (
                   <object
                     data={fileUrl}
                     type="application/pdf"
                     className="w-full h-full absolute inset-0"
                   >
                     <div className="flex h-full items-center justify-center p-4 text-center">
                        <p className="text-xs font-medium text-slate-500 flex flex-col gap-2 items-center">
                          <span>Preview not available.</span>
                          <span className="font-bold text-slate-700 break-all">{file.name}</span>
                        </p>
                     </div>
                   </object>
                )}
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-xs font-bold border border-red-100 uppercase tracking-widest">
                {error}
              </div>
            )}
          </div>

          {file && (
             <div className="mt-8 flex-shrink-0">
               <button
                 onClick={triggerExtract}
                 disabled={isExtracting}
                 className={cn(
                   "w-full py-4 bg-slate-900 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2",
                   isExtracting && "opacity-75 cursor-not-allowed"
                 )}
               >
                 {isExtracting ? (
                   <><Loader2 className="w-4 h-4 animate-spin" /> Processing OCR...</>
                 ) : (
                   <><Zap className="w-4 h-4" /> Generate Export</>
                 )}
               </button>
             </div>
          )}
        </aside>

        {/* RIGHT PANE: Extracted Content Viewer */}
        <section className={cn(
          "flex-1 bg-slate-100 flex flex-col p-6 xl:p-8 overflow-hidden transition-opacity duration-300 z-0",
          !extractedHtml && !isExtracting ? "opacity-50 pointer-events-none" : "opacity-100"
        )}>
          <div className="flex-1 bg-white shadow-xl border border-indigo-100 rounded-2xl flex flex-col relative ring-4 ring-indigo-500/5 overflow-hidden">
            <div className="px-6 py-3 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
              <h2 className="text-[10px] font-bold uppercase text-indigo-600 flex items-center gap-2 tracking-widest">
                <ArrowRight className="w-3 h-3" /> Editable Word Preview
              </h2>
              {extractedHtml ? (
                  <span className="px-2 py-0.5 bg-indigo-600 text-[8px] text-white rounded font-bold tracking-widest uppercase shadow-[0_2px_10px_rgba(79,70,229,0.2)]">AI ENHANCED</span>
              ) : (
                  <span className="px-2 py-0.5 bg-slate-200 text-[8px] text-slate-500 rounded font-bold tracking-widest uppercase">WAITING INPUT</span>
              )}
            </div>
            
            <div className="flex-1 p-6 xl:p-10 relative overflow-hidden flex flex-col bg-[#F8FAFC]">
              {isExtracting ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 z-10">
                   <Loader2 className="w-8 h-8 animate-spin mb-6 text-indigo-500 drop-shadow-md" />
                   <p className="font-bold text-slate-700 tracking-wide">{extractionStatus || 'Running OCR...'}</p>
                   <p className="text-xs font-medium text-slate-500 mt-2 text-center max-w-[300px]">Running 100% locally in your browser to save cost.</p>
                </div>
              ) : extractedHtml ? (
                <div className="flex-1 overflow-y-auto shadow-sm rounded-xl">
                  <div 
                    className="prose prose-slate prose-sm md:prose-base mx-auto w-full max-w-[850px] focus:outline-none p-10 sm:p-14 bg-white border border-slate-200 min-h-full transition-colors font-serif text-slate-800"
                    contentEditable
                    ref={editorRef}
                    onInput={handleEditorInput}
                    dangerouslySetInnerHTML={{ __html: extractedHtml }}
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 mx-auto w-full max-w-[850px]">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Document preview waiting</p>
                </div>
              )}
            </div>

            {/* Floating Download Button positioned bottom right of the preview wrapper */}
            {extractedHtml && (
               <div className="absolute bottom-8 right-8 z-20">
                 <button
                   onClick={triggerExport}
                   disabled={isExporting}
                   className={cn(
                     "flex items-center space-x-2 px-6 py-3.5 rounded-full font-bold text-xs uppercase tracking-widest shadow-xl transition-all",
                     isExporting ? "bg-indigo-400 text-white cursor-not-allowed shadow-none" : 
                     "bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 hover:shadow-2xl hover:shadow-indigo-500/20"
                   )}
                 >
                   {isExporting ? (
                     <><Loader2 className="w-4 h-4 animate-spin" /> <span>Exporting...</span></>
                   ) : (
                     <><Download className="w-4 h-4" /> <span>Download .docx</span></>
                   )}
                 </button>
               </div>
            )}
          </div>
        </section>


      </main>
      
      <style>{`
        /* Minimalist scrollbar for the editor */
        .prose::-webkit-scrollbar {
          width: 6px;
        }
        .prose::-webkit-scrollbar-track {
          background: transparent;
        }
        .prose::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.5);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
