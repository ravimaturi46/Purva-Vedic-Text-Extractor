import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileText, ArrowRight, Download, Loader2, FileType2, Search, Zap, Copy, Check } from 'lucide-react';
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
  const [extractionMode, setExtractionMode] = useState<'local' | 'ai'>('local');
  const [isExporting, setIsExporting] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userApiKey, setUserApiKey] = useState<string>('');
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isExtracting) {
      setElapsedTime(0);
      timer = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isExtracting]);

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
      if (selectedFile.type !== 'application/pdf' && !selectedFile.type.startsWith('image/')) {
        setError('Please upload a valid PDF or Image file.');
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
      if (droppedFile.type !== 'application/pdf' && !droppedFile.type.startsWith('image/')) {
        setError('Please upload a valid PDF or Image file.');
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
    setExtractedHtml('');
    setError(null);
    setExtractionStatus('Initializing Local OCR (0% cost)...');
    
    try {
      let combinedHtml = '';

      const langString = selectedLanguages.join('+');
      const langNames = selectedLanguages.map(c => AVAILABLE_LANGUAGES.find(l => l.code === c)?.label).join(' & ');
      
      setExtractionStatus(`Loading ${langNames} language model...`);
      const worker = await Tesseract.createWorker(langString, 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
             setExtractionStatus(`OCR Processing ( ${Math.round(m.progress * 100)}% )...`);
          } else if (m.status.includes('downloading')) {
             setExtractionStatus(`Downloading language models (${Math.round(m.progress * 100)}%)...`);
          } else {
             setExtractionStatus(`Tesseract: ${m.status}...`);
          }
        }
      });

      if (file.type.startsWith('image/')) {
         setExtractionStatus(`Rendering Image for OCR...`);
         const fileUrlForOcr = URL.createObjectURL(file);
         
         const { data: { text } } = await worker.recognize(fileUrlForOcr);
         
         let formattedText = '';
         if (!text || text.trim() === '') {
           formattedText = `<p style="margin-bottom: 1em; color: #94a3b8; font-style: italic; font-size: 0.875rem;">[No text detected on this image.]</p>`;
         } else {
           // Re-format into paragraphs to maintain loose layout
           formattedText = text.split('\n\n').map(p => `<p style="margin-bottom: 1em;">${p.replace(/\n/g, '<br/>')}</p>`).join('');
         }
         
         combinedHtml += `<div style="padding-bottom: 1.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid #e2e8f0;">
           <h4 style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.1em; font-family: sans-serif;">Extracted Image</h4>
           ${formattedText}
         </div>`;
         
         URL.revokeObjectURL(fileUrlForOcr);
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;

        for (let i = 1; i <= numPages; i++) {
          setExtractionStatus(`Rendering Page ${i} of ${numPages}...`);
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.5 }); // High scale for clear text from photos
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            // Fill canvas with white background before rendering PDF
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // @ts-ignore
            await page.render({ canvasContext: ctx, viewport }).promise;
            
            setExtractionStatus(`OCR Processing Page ${i} of ${numPages}...`);
            // Converting to JPEG data URL handles issues where Tesseract doesn't correctly read offline canvases
            const imageData = canvas.toDataURL('image/jpeg', 1.0);
            const { data: { text } } = await worker.recognize(imageData);
            
            let formattedText = '';
            if (!text || text.trim() === '') {
              formattedText = `<p style="margin-bottom: 1em; color: #94a3b8; font-style: italic; font-size: 0.875rem;">[No text detected on this page.]</p>`;
            } else {
              // Re-format into paragraphs to maintain loose layout
              formattedText = text.split('\n\n').map(p => `<p style="margin-bottom: 1em;">${p.replace(/\n/g, '<br/>')}</p>`).join('');
            }
            
            combinedHtml += `<div style="padding-bottom: 1.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid #e2e8f0;">
              <h4 style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.1em; font-family: sans-serif;">Page ${i}</h4>
              ${formattedText}
            </div>`;
          }
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

  const triggerAIExtract = async () => {
    if (!file) return;
    
    if (!userApiKey || !userApiKey.trim()) {
      setError('Please enter your Gemini API Key first.');
      return;
    }
    
    setIsExtracting(true);
    setExtractedHtml('');
    setError(null);
    setExtractionStatus('Initializing AI Engine (Server-side Gemini)...');
    
    try {
      const processSingleImageWithAI = async (fileDataStr: string, mime: string, onChunk: (text: string) => void, retryCount = 0): Promise<string> => {
        const response = await fetch('/api/extract-text-gemini', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            fileData: fileDataStr, 
            mimeType: mime,
            languages: selectedLanguages.map(c => AVAILABLE_LANGUAGES.find(l => l.code === c)?.label || c),
            userApiKey: userApiKey.trim() || undefined
          }),
        });
        
        if (!response.ok) {
          let errorMsg = 'Failed to extract text with AI';
          try {
            const data = await response.json();
            errorMsg = data.error || errorMsg;
          } catch (e) {}
          
          if ((errorMsg.includes('429') || errorMsg.includes('Quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) && retryCount < 3) {
             let retrySeconds = 30; // default
             const retryMatch = errorMsg.match(/retry in ([\d\.]+)s/i);
             if (retryMatch && retryMatch[1]) {
                retrySeconds = Math.ceil(parseFloat(retryMatch[1])) + 2; // Add 2s buffer
             } else if (errorMsg.includes('47s')) { // Fallback based on error msg
                retrySeconds = 47;
             } else {
                retrySeconds = 60; // if we can't parse, wait 60 seconds
             }
             
             for (let s = retrySeconds; s > 0; s--) {
               setExtractionStatus(`API Rate limit hit. Retrying in ${s}s...`);
               await new Promise(r => setTimeout(r, 1000));
             }
             setExtractionStatus('Retrying AI request...');
             return processSingleImageWithAI(fileDataStr, mime, onChunk, retryCount + 1);
          }
          
          throw new Error(errorMsg);
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          if (data.error) throw new Error(data.error);
          if (data.text) {
             onChunk(data.text);
             return data.text;
          }
          return '';
        }
        
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let done = false;
        let fullText = '';
        
        while (reader && !done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            fullText += chunk;
            
            if (fullText.includes('[ERROR: ')) {
              const errorMatch = fullText.match(/\[ERROR: (.*?)\]/);
              if (errorMatch) {
                throw new Error(errorMatch[1]);
              }
            }
            
            onChunk(fullText);
          }
        }
        return fullText;
      };

      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;
        let combinedHtml = '';

        for (let i = 1; i <= numPages; i++) {
          setExtractionStatus(`Rendering Page ${i} of ${numPages} for AI...`);
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.5 }); // High scale for clear text
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
             const renderContext = { canvasContext: ctx, viewport: viewport };
             await page.render(renderContext).promise;
             const imageDataUrl = canvas.toDataURL('image/jpeg', 0.95);
             
             setExtractionStatus(`AI Connected! Streaming Page ${i} of ${numPages}...`);
             
             const pageHeader = `<div style="padding-bottom: 1.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid #e2e8f0;">
              <h4 style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.1em; font-family: sans-serif;">Page ${i}</h4>`;
             const pageFooter = `</div>`;

             const finalPageHtml = await processSingleImageWithAI(imageDataUrl, 'image/jpeg', (chunk) => {
               setExtractedHtml(combinedHtml + pageHeader + chunk + pageFooter);
             });
             
             combinedHtml += pageHeader + finalPageHtml + pageFooter;
             setExtractedHtml(combinedHtml);
          }
        }
      } else {
        setExtractionStatus('Preparing image for AI upload...');
        const fileData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        setExtractionStatus('Connecting to Gemini API & uploading image...');
        await processSingleImageWithAI(fileData, file.type, (chunk) => {
          setExtractedHtml(chunk);
        });
      }
      
    } catch (err: any) {
      console.error(err);
      let errorMessage = err.message || 'Failed to extract text using AI.';
      
      try {
        const parsed = JSON.parse(errorMessage);
        if (parsed.error && parsed.error.message) {
          errorMessage = parsed.error.message;
        }
      } catch (e) {
        // Not valid JSON, ignore
      }

      if (errorMessage.includes('429') || errorMessage.includes('Quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
         errorMessage = "API Quota Exceeded: Your free tier API key limit has been reached. Please check your Google AI Studio billing details or try again later.";
      }

      setError(errorMessage);
    } finally {
      setIsExtracting(false);
      setExtractionStatus('');
      setUserApiKey(''); // Clear API key after use for security as requested
    }
  };

  const triggerExport = () => {
    if (!extractedHtml) return;
    
    setIsExporting(true);
    setError(null);
    
    try {
      const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export HTML To Doc</title></head><body>";
      const footer = "</body></html>";
      const htmlContent = header + extractedHtml + footer;
      
      const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file ? file.name.replace('.pdf', '_extracted.doc') : 'extracted_document.doc';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to export document locally.');
    } finally {
      setIsExporting(false);
    }
  };

  const copyToClipboard = async () => {
    if (!editorRef.current) return;
    try {
      await navigator.clipboard.writeText(editorRef.current.innerText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setError('Failed to copy to clipboard.');
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
          <div className="flex text-xs font-bold text-slate-400 uppercase tracking-widest gap-1.5 items-center hidden md:flex">
            <Search className="w-4 h-4" /> Layout Preserving Engine
          </div>
          <a 
            href="https://www.purvavedic.com" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors flex items-center gap-1 bg-indigo-50 px-3 py-1.5 rounded-full"
          >
            Purva Vedic Consultancy
          </a>
        </div>
      </header>

      <main className="flex-1 flex flex-col xl:flex-row overflow-hidden w-full max-w-full">
        
        {/* LEFT PANE: PDF Uploader / Viewer */}
        <aside className="w-full xl:w-[420px] 2xl:w-[480px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col p-4 md:p-6 overflow-y-auto z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)] xl:h-full h-[50vh] min-h-[350px]">
          <div className="mb-6 flex flex-col gap-4 md:gap-5">
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
          
          <div className="flex-1 flex flex-col overflow-hidden min-h-[200px]">
            {!file ? (
              <div 
                className={cn(
                  "p-6 md:p-8 bg-slate-50 border-2 border-dashed border-indigo-200 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors flex-1",
                  "hover:bg-indigo-50/50 group text-center"
                )}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*,application/pdf" 
                  className="hidden" 
                />
                <div className="w-12 h-12 bg-white shadow-sm flex items-center justify-center rounded mb-4 text-indigo-400 group-hover:text-indigo-600 transition-colors">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-700 mb-1">Upload PDF or Image</p>
                <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
                  Take a photo, select an image, or upload a PDF document
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col bg-slate-50 rounded-xl border border-slate-200 overflow-hidden relative shadow-inner">
                {fileUrl && (
                   file.type.startsWith('image/') ? (
                     <img src={fileUrl} alt="Preview" className="w-full h-full object-contain absolute inset-0" />
                   ) : (
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
                   )
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
             <div className="mt-8 flex-shrink-0 flex flex-col gap-3">
               <button
                 onClick={() => { setExtractionMode('local'); triggerExtract(); }}
                 disabled={isExtracting}
                 className={cn(
                   "w-full py-3 bg-slate-900 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-slate-800 transition-all shadow-lg flex items-center justify-center gap-2",
                   isExtracting && "opacity-75 cursor-not-allowed"
                 )}
               >
                 {isExtracting && extractionMode === 'local' ? (
                   <><Loader2 className="w-4 h-4 animate-spin" /> Processing OCR...</>
                 ) : (
                   <><Zap className="w-4 h-4" /> Local OCR Extract</>
                 )}
               </button>
               
               <div className="flex flex-col gap-2 mt-2 pt-4 border-t border-slate-100">
                 <input
                   type="password"
                   placeholder="Enter your Gemini API Key..."
                   value={userApiKey}
                   onChange={(e) => setUserApiKey(e.target.value)}
                   className="w-full px-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 placeholder:text-slate-400"
                 />
                 <p className="text-[10px] text-slate-500 font-medium leading-relaxed px-1">
                   Get your free API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-bold">Google AI Studio</a>. The key is never saved and is cleared upon extraction.
                 </p>
                 <button
                   onClick={() => { setExtractionMode('ai'); triggerAIExtract(); }}
                   disabled={isExtracting}
                   className={cn(
                     "w-full py-3 bg-indigo-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-indigo-700 transition-all shadow-lg flex items-center justify-center gap-2 relative overflow-hidden group",
                     isExtracting && "opacity-75 cursor-not-allowed"
                   )}
                 >
                   <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                   <span className="relative flex items-center gap-2">
                     {isExtracting && extractionMode === 'ai' ? (
                       <><Loader2 className="w-4 h-4 animate-spin" /> Processing AI...</>
                     ) : (
                       <><Search className="w-4 h-4" /> AI Enhanced Extract</>
                     )}
                   </span>
                 </button>
               </div>
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
              {isExtracting && !extractedHtml ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 z-10">
                   <Loader2 className="w-8 h-8 animate-spin mb-6 text-indigo-500 drop-shadow-md" />
                   <p className="font-bold text-slate-700 tracking-wide">{extractionStatus || 'Running Extraction...'}</p>
                   {extractionMode === 'ai' && (
                     <div className="flex flex-col items-center mt-3 gap-1">
                       <span className="text-sm font-mono bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">{elapsedTime}s elapsed</span>
                       <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-1">Est. time: 10-30s per page</span>
                       {elapsedTime > 5 && elapsedTime <= 15 && <p className="text-xs text-indigo-500 animate-pulse mt-1">Analyzing text, please wait...</p>}
                       {elapsedTime > 15 && elapsedTime <= 30 && <p className="text-xs text-indigo-500 mt-1">Complex document detected, still processing...</p>}
                       {elapsedTime > 30 && <p className="text-xs text-amber-500 animate-pulse mt-1">Taking longer than usual, please hold on...</p>}
                     </div>
                   )}
                   <p className="text-xs font-medium text-slate-500 mt-4 text-center max-w-[300px]">
                     {extractionMode === 'local' ? 'Running 100% locally in your browser to save cost.' : 'Using server-side AI for enhanced accuracy on complex or handwritten documents.'}
                   </p>
                </div>
              ) : extractedHtml ? (
                <div className="flex-1 overflow-y-auto shadow-sm rounded-xl relative">
                  {isExtracting && (
                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm border border-indigo-100 shadow-sm px-3 py-1.5 rounded-full flex items-center gap-2 z-20">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                      <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">AI Connected • Streaming...</span>
                    </div>
                  )}
                  <div 
                    className="prose prose-slate prose-sm md:prose-base mx-auto w-full max-w-[850px] focus:outline-none p-10 sm:p-14 bg-white border border-slate-200 min-h-full transition-colors font-serif text-slate-800"
                    contentEditable={!isExtracting}
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

            {/* Floating Buttons positioned bottom right of the preview wrapper */}
            {extractedHtml && (
               <div className="absolute bottom-8 right-8 z-20 flex gap-3">
                 <button
                   onClick={copyToClipboard}
                   className={cn(
                     "flex items-center justify-center w-12 h-12 rounded-full shadow-xl transition-all",
                     isCopied 
                       ? "bg-emerald-500 text-white" 
                       : "bg-white text-slate-600 hover:bg-slate-50 hover:scale-105 hover:shadow-2xl hover:text-indigo-600"
                   )}
                   title="Copy to clipboard"
                 >
                   {isCopied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                 </button>
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
                     <><Download className="w-4 h-4" /> <span>Download .doc</span></>
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
