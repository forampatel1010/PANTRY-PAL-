import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UploadCloud, X, ImageIcon, Camera } from 'lucide-react'

export default function ImageUpload({ onFileSelect }) {
  const [preview, setPreview] = useState(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const galleryInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return

    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    onFileSelect(file)
  }

  const onChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setIsDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const clearImage = (e) => {
    e.stopPropagation()
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    onFileSelect(null)
    if (galleryInputRef.current) galleryInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  return (
    <div className="w-full flex flex-col gap-2">
      <label className="text-sm font-bold text-food-dark flex items-center gap-2">
        <ImageIcon size={15} className="text-food-primary" />
        Food photo
      </label>

      <div className="flex flex-col sm:flex-row gap-2 w-full">
        <button
          type="button"
          disabled={!!preview}
          onClick={() => cameraInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 border-slate-200 bg-white text-food-dark text-sm font-semibold hover:border-food-primary/50 hover:bg-orange-50/40 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
          <Camera size={18} className="text-food-primary shrink-0" />
          Take photo
        </button>
        <button
          type="button"
          disabled={!!preview}
          onClick={() => galleryInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 border-slate-200 bg-white text-food-dark text-sm font-semibold hover:border-food-primary/50 hover:bg-orange-50/40 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
          <ImageIcon size={18} className="text-food-primary shrink-0" />
          Gallery
        </button>
      </div>

      <div
        className={`relative w-full h-36 rounded-2xl border-2 border-dashed transition-all duration-300 flex items-center justify-center overflow-hidden cursor-pointer group
          ${isDragActive ? 'border-food-primary bg-orange-50' : 'border-slate-200 hover:border-food-primary/40 bg-slate-50/50 hover:bg-orange-50/30'}
          ${preview ? 'cursor-default' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragActive(true) }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={onDrop}
        onClick={() => !preview && galleryInputRef.current?.click()}
        role={preview ? undefined : 'button'}
        tabIndex={preview ? undefined : 0}
        onKeyDown={(e) => {
          if (preview) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            galleryInputRef.current?.click()
          }
        }}
      >
        <input
          type="file"
          accept="image/*"
          ref={galleryInputRef}
          onChange={onChange}
          className="hidden"
        />
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={cameraInputRef}
          onChange={onChange}
          className="hidden"
        />

        <AnimatePresence mode="wait">
          {preview ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-0 w-full h-full"
            >
              <img
                src={preview}
                alt="Upload preview"
                className="w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-opacity"
              />
              <button
                onClick={clearImage}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 backdrop-blur-md text-white hover:bg-red-500/80 transition-colors z-10 shadow-lg"
                aria-label="Remove image"
              >
                <X size={16} />
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-3 text-food-muted pointer-events-none"
            >
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center group-hover:scale-110 group-hover:bg-orange-100 transition-all duration-300 border border-slate-200">
                <UploadCloud size={20} className="group-hover:text-food-primary transition-colors" />
              </div>
              <div className="text-center px-2">
                <p className="text-sm font-semibold text-food-dark">Or tap here / drag a photo</p>
                <p className="text-xs text-food-muted mt-1">Use camera or gallery above on your phone</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
