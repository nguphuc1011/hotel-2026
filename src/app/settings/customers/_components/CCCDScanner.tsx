'use client';

import React, { useRef, useState, useCallback } from 'react';
import Tesseract from 'tesseract.js';
import jsQR from 'jsqr'; // Import jsQR
import { motion, AnimatePresence } from 'framer-motion';
import { X, Scan, Loader2, AlertCircle, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CCCDScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (data: {
    fullName: string;
    idNumber: string;
    dob: string;
    address: string;
  }) => void;
}

export default function CCCDScanner({ isOpen, onClose, onScanComplete }: CCCDScannerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

  const preprocessImage = (imageSrc: string): Promise<HTMLCanvasElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Không thể lấy context từ canvas'));
        }
        
        // Tăng kích thước ảnh để nhận diện tốt hơn
        const scale = 2.0;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        // 3. Tiền xử lý ảnh: Grayscale và Contrast 150% (1.5)
        ctx.filter = 'grayscale(1) contrast(1.5)';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        resolve(canvas);
      };
      img.onerror = () => reject(new Error('Không thể tải ảnh để xử lý'));
      img.src = imageSrc;
    });
  };

  // Rewritten processImage function with improved OCR and QR
  const processImage = async (imageSrc: string) => {
    setIsScanning(true);
    setError(null);
    setProgress(0);
    setStatus('Đang khởi tạo...');

    try {
      // 1. Tiền xử lý ảnh (Grayscale + Contrast)
      setStatus('Đang xử lý hình ảnh...');
      const canvas = await preprocessImage(imageSrc);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Không thể lấy context từ canvas');

      // 2. Thử quét mã QR (Ưu tiên)
      setStatus('Đang tìm mã QR...');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (qrCode) {
        setStatus('Đã tìm thấy mã QR! Đang giải mã...');
        const qrData = qrCode.data.split('|');
        if (qrData.length >= 6) {
          const extractedData = {
            idNumber: qrData[0] || 'N/A',
            fullName: qrData[2] || 'N/A',
            dob: qrData[3] || 'N/A',
            address: qrData[5] || 'N/A',
          };
          onScanComplete(extractedData);
          onClose();
          return;
        }
      }

      // 3. Nhận diện ký tự (OCR Fallback) với cấu hình "best"
      setStatus('Đang tải dữ liệu ngôn ngữ...');
      const { data: { text } } = await Tesseract.recognize(
        canvas,
        'vie',
        {
          // 1. Nguồn dữ liệu ngôn ngữ tốt nhất (4.0.0_best)
          langPath: 'https://tessdata.projectnaptha.com/4.0.0_best',
          // 2. Whitelist ký tự tiếng Việt đầy đủ
          tessedit_char_whitelist: '0123456789ABCDEGHIKLMNOPQRSTUVXYÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴÝỶỸ ',
          // 3. Các cấu hình bổ sung để tăng độ chính xác và giảm cảnh báo rác
          tessjs_create_pdf: '0',
          tessjs_create_hocr: '0',
          logger: m => {
            if (m.status === 'recognizing text') {
              setProgress(Math.round(m.progress * 100));
              setStatus(`Đang nhận diện: ${Math.round(m.progress * 100)}%`);
            }
          },
        }
      );
      
      console.log('OCR Result:', text);
      const extractedData = parseCCCDText(text);
      onScanComplete(extractedData);
      onClose();

    } catch (err: any) {
      console.error('Processing Error:', err);
      setError('Không thể xử lý ảnh. Vui lòng thử lại với ảnh rõ nét hơn.');
    } finally {
      setIsScanning(false);
      setStatus('');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const imageSrc = reader.result as string;
      await processImage(imageSrc);
    };
    reader.readAsDataURL(file);
  };

  // The parseCCCDText function remains the same as it's a good fallback
  const parseCCCDText = (text: string) => {
    console.log('--- OCR Raw Text ---\n', text);
    const fixDigits = (str: string) => str.replace(/O|D|Q/g, '0').replace(/I|L|l/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/G/g, '6');
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    let fullName = '', idNumber = '', dob = '', address = '';

    const idPattern = /[0-9O|D|Q|I|L|l|S|B|G]{12}/;
    const rawIdMatch = text.replace(/\s/g, '').match(idPattern);
    if (rawIdMatch) idNumber = fixDigits(rawIdMatch[0]);

    const dobMatch = text.match(/([0-9O]{2}\/[0-9O]{2}\/[0-9O]{4})/);
    if (dobMatch) dob = dobMatch[1].replace(/O/g, '0');

    for (let i = 0; i < lines.length; i++) {
      const lineUpper = lines[i].toUpperCase();
      if (lineUpper.includes('FULL NAME') || lineUpper.includes('HỌ VÀ TÊN')) {
        let potentialName = '';
        const parts = lines[i].split(/[:|]/);
        if (parts.length > 1 && parts[parts.length - 1].trim().length > 3) {
          potentialName = parts[parts.length - 1].trim();
        } else if (i + 1 < lines.length) {
          potentialName = lines[i+1].trim();
          if ((potentialName.length < 3 || /\d{2}\/\d{2}\/\d{4}/.test(potentialName)) && i + 2 < lines.length) {
            potentialName = lines[i+2].trim();
          }
        }
        if (potentialName.length >= 3) {
          fullName = potentialName.replace(/^[|:.\-_\s38©]+/, '').replace(/[|:.\-_\s]+$/, '').toUpperCase();
          break;
        }
      }
    }

    const addressKeywords = ['NƠI THƯỜNG TRÚ', 'PLACE OF RESIDENCE', 'QUÊ QUÁN', 'PLACE OF ORIGIN', 'THƯỜNG TRÚ', 'NƠI Ở'];
    for (let i = 0; i < lines.length; i++) {
      const lineUpper = lines[i].toUpperCase();
      if (addressKeywords.some(kw => lineUpper.includes(kw))) {
        let addressParts = [];
        const parts = lines[i].split(/[:|]/);
        if (parts.length > 1 && parts[parts.length - 1].trim().length > 3) {
          addressParts.push(parts[parts.length - 1].trim());
        }
        for (let j = 1; j <= 2; j++) {
          if (i + j < lines.length) {
            const nextLine = lines[i + j];
            const nextLineUpper = nextLine.toUpperCase();
            if (nextLineUpper.includes('GIÁ TRỊ') || nextLineUpper.includes('CÓ GIÁ TRỊ') || nextLineUpper.includes('ĐẶC ĐIỂM') || nextLineUpper.includes('NGÀY') || nextLineUpper.includes('DATE')) break;
            addressParts.push(nextLine.trim());
          }
        }
        address = addressParts.join(', ').replace(/[|„_"\-]+/g, ' ').replace(/\s+/g, ' ').replace(/, ,/g, ',').trim();
        break;
      }
    }

    return {
      fullName: fullName || 'Không nhận diện được',
      idNumber: idNumber || 'Không nhận diện được',
      dob: dob || 'Không nhận diện được',
      address: address || 'Không nhận diện được'
    };
  };

  if (!isOpen) return null;

  // The entire UI/UX part remains unchanged as requested
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-2xl bg-slate-900 rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl"
        >
          {/* Header */}
          <div className="p-6 flex items-center justify-between border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                <Scan size={20} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Tải ảnh CCCD Khách Hàng</h3>
                <p className="text-xs text-slate-400">Ưu tiên quét mã QR, sau đó tới chữ trên thẻ</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-400 hover:bg-white/10 hover:text-white transition-all"
            >
              <X size={20} />
            </button>
          </div>

          {/* Upload View Area */}
          <div className="relative aspect-video bg-slate-950/50 flex items-center justify-center overflow-hidden border-b border-white/5">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-blue-500/5 transition-all group relative"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full group-hover:bg-blue-500/30 transition-all" />
                <div className="relative w-24 h-24 rounded-3xl bg-slate-800 border border-white/10 flex items-center justify-center text-blue-400 mb-6 group-hover:scale-110 group-hover:border-blue-500/50 transition-all duration-500">
                  <Upload size={48} strokeWidth={1.5} />
                </div>
              </div>
              <h4 className="text-white font-bold text-2xl mb-2 group-hover:text-blue-400 transition-colors">Tải ảnh CCCD</h4>
              <p className="text-slate-400 text-sm text-center max-w-xs px-6 leading-relaxed">
                Hệ thống sẽ tự động quét mã QR và thông tin văn bản từ ảnh chụp mặt trước
              </p>
            </div>

            {isScanning && (
              <div className="absolute inset-0 pointer-events-none">
                <motion.div
                  className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_15px_rgba(59,130,246,0.8)] z-10"
                  initial={{ top: '0%' }}
                  animate={{ top: '100%' }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "linear"
                  }}
                />
              </div>
            )}

            {isScanning && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center z-50">
                <div className="relative w-24 h-24 mb-6">
                  <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
                  <motion.div 
                    className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white font-bold">{progress > 0 ? `${progress}%` : ''}</span>
                  </div>
                </div>
                
                <p className="text-white font-black text-xl tracking-widest uppercase mb-2">Tháo AI</p>
                <p className="text-blue-400 font-bold animate-pulse">{status}</p>
                
                <div className="w-48 h-1 bg-white/10 rounded-full mt-6 overflow-hidden">
                  <motion.div 
                    className="h-full bg-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="p-8 flex flex-col items-center gap-4 bg-slate-900/50">
            {error && (
              <div className="w-full p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400 text-sm mb-2">
                <AlertCircle size={18} />
                {error}
              </div>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />
            
            <div className="flex flex-col items-center gap-4 w-full justify-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isScanning}
                className={cn(
                  "relative group px-12 py-4 rounded-full font-black text-lg tracking-wider transition-all duration-500 overflow-hidden min-w-[240px]",
                  isScanning
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
                    : "bg-blue-600 text-white hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_30px_rgba(37,99,235,0.6)]"
                )}
              >
                <div className="relative z-10 flex items-center justify-center gap-3">
                  {isScanning ? <Loader2 className="animate-spin" /> : <Upload />}
                  {isScanning ? "ĐANG XỬ LÝ..." : "CHỌN ẢNH TỪ MÁY"}
                </div>
                
                {!isScanning && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                )}
              </button>
            </div>
            
            <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest text-center max-w-[300px]">
              Ảnh được xử lý bảo mật tại trình duyệt, không lưu trữ trên máy chủ
            </p>
            <p className="text-slate-600 text-[9px] uppercase font-medium tracking-tighter">
              Powered by Tháo AI, jsQR & Tesseract.js
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
