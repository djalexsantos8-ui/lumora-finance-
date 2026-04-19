/**
 * Compressão e normalização client-side de arquivos antes do upload.
 *
 * Decisão: compressão no BROWSER (não server). Razões:
 *   · Vercel serverless body limit ~4.5MB — inviável para arquivos grandes
 *   · Bandwidth do usuário é o recurso mais caro (4G); comprimir antes poupa
 *   · CPU serverless custa; CPU do browser é grátis
 *   · Bibliotecas usam Web Workers, UI não trava
 *
 * Estratégia por tipo:
 *   · HEIC/HEIF  → converte pra JPEG (heic2any) → comprime (browser-image-compression)
 *   · JPEG/PNG   → comprime direto (browser-image-compression)
 *   · PDF        → passthrough (re-compressão de PDF exige ferramenta server-side
 *                  tipo Ghostscript; não vale a complexidade agora)
 *
 * Imports são DINÂMICOS pra não bloar o bundle principal. heic2any tem ~1.5MB
 * gzipped (libheif em wasm) — só sobe quando realmente precisa.
 */

import {
  JOB_FILE_MAX_FINAL_BYTES,
  JOB_FILE_MAX_INPUT_BYTES,
  JOB_FILE_MIME_WHITELIST,
  type JobFileMime,
} from '@/types/job-file'

// Targets conservadores — priorizam qualidade legível sobre tamanho mínimo.
// Contrato escaneado precisa dar pra ler, foto de comprovante precisa dar pra
// ler o valor, entregável visual precisa preservar o essencial.
const IMAGE_TARGET_MAX_BYTES = 1.5 * 1024 * 1024 // 1.5MB
const IMAGE_MAX_DIMENSION    = 2048              // long edge
const IMAGE_QUALITY          = 0.85

export interface PreparedFile {
  file:      File            // blob final pra upload
  mimeType:  JobFileMime     // tipo final (pode ser diferente do original: HEIC→JPEG)
  displayName: string        // nome legível (pode ter extensão trocada)
}

/** Validação tipo + tamanho de entrada. Lança Error com mensagem amigável. */
function validateInput(file: File) {
  if (file.size <= 0) throw new Error('Arquivo vazio.')
  if (file.size > JOB_FILE_MAX_INPUT_BYTES) {
    const mb = Math.round(JOB_FILE_MAX_INPUT_BYTES / (1024 * 1024))
    throw new Error(`Arquivo muito grande (máx ${mb}MB).`)
  }
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  // type vazio em alguns HEIC do iPhone — cai no fallback por extensão
  const isHeic = type === 'image/heic' || type === 'image/heif' ||
                 name.endsWith('.heic') || name.endsWith('.heif')
  const isPdf  = type === 'application/pdf' || name.endsWith('.pdf')
  const isJpeg = type === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg')
  const isPng  = type === 'image/png'  || name.endsWith('.png')

  if (!isHeic && !isPdf && !isJpeg && !isPng) {
    throw new Error('Tipo não suportado. Use PDF, JPG, PNG ou HEIC.')
  }
  return { isHeic, isPdf, isJpeg, isPng }
}

// ─── HEIC → JPEG ──────────────────────────────────────────────────────────────
async function heicToJpeg(file: File): Promise<File> {
  const { default: heic2any } = await import('heic2any')
  const blob = await heic2any({
    blob:    file,
    toType:  'image/jpeg',
    quality: IMAGE_QUALITY,
  })
  const jpegBlob = Array.isArray(blob) ? blob[0] : blob
  const newName  = file.name.replace(/\.(heic|heif)$/i, '.jpg')
  return new File([jpegBlob], newName || 'photo.jpg', {
    type:         'image/jpeg',
    lastModified: file.lastModified,
  })
}

// ─── JPEG/PNG compression ─────────────────────────────────────────────────────
async function compressImage(file: File): Promise<File> {
  const { default: imageCompression } = await import('browser-image-compression')
  const compressed = await imageCompression(file, {
    maxSizeMB:         IMAGE_TARGET_MAX_BYTES / (1024 * 1024),
    maxWidthOrHeight:  IMAGE_MAX_DIMENSION,
    useWebWorker:      true,
    initialQuality:    IMAGE_QUALITY,
    // PNG → JPEG reduz muito em screenshots; mantém PNG se for imagem sintética
    // pequena (mais uma lib heurística — aqui simplificamos convertendo tudo
    // que tem transparência opaca).
    fileType:          file.type === 'image/png' ? 'image/png' : 'image/jpeg',
  })
  // imageCompression retorna sempre um File no browser, mas coagimos pra Blob
  // na fallback (defense in depth — nunca passa um tipo estranho pro caller).
  if (compressed instanceof File) return compressed
  const blob = compressed as Blob
  return new File([blob], file.name, { type: blob.type || file.type })
}

// ─── prepareJobFile — orquestra: valida, converte, comprime ───────────────────
//
// Retorna um File pronto pra upload direto ao Storage. Se o arquivo final
// ainda ultrapassar o limite, lança erro amigável (usuário precisa enviar
// algo menor ou aceitar qualidade pior — fora de escopo agora).

export async function prepareJobFile(file: File): Promise<PreparedFile> {
  const { isHeic, isPdf, isJpeg, isPng } = validateInput(file)

  let working: File
  let mimeType: JobFileMime

  if (isPdf) {
    working  = file
    mimeType = 'application/pdf'
  } else if (isHeic) {
    const jpeg  = await heicToJpeg(file)
    working     = await compressImage(jpeg)
    mimeType    = 'image/jpeg'
  } else if (isJpeg) {
    working  = await compressImage(file)
    mimeType = 'image/jpeg'
  } else if (isPng) {
    working  = await compressImage(file)
    // compressImage pode ter mantido image/png — reflete
    mimeType = (working.type === 'image/png' ? 'image/png' : 'image/jpeg')
  } else {
    // teoricamente inalcançável dado o validateInput
    throw new Error('Tipo não suportado.')
  }

  if (working.size > JOB_FILE_MAX_FINAL_BYTES) {
    const mb = Math.round(JOB_FILE_MAX_FINAL_BYTES / (1024 * 1024))
    throw new Error(`Arquivo final maior que ${mb}MB após compressão. Tente um arquivo menor.`)
  }

  // Última defense-in-depth: mime final precisa estar na whitelist
  if (!JOB_FILE_MIME_WHITELIST.includes(mimeType)) {
    throw new Error('Tipo de arquivo final inválido.')
  }

  return {
    file:        working,
    mimeType,
    displayName: working.name || file.name || 'arquivo',
  }
}

// ─── sanitizeFileName — para usar no path do storage ──────────────────────────
//
// Remove path separators, collapses whitespace, limita tamanho.
// Não é o nome legível (esse fica em job_files.file_name); é só o que vai pro
// final do storage_path pra facilitar debugging.

export function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove diacríticos
    .replace(/[^\w.\-]+/g, '-')                        // qualquer coisa não-word vira -
    .replace(/-+/g, '-')                               // colapsa múltiplos -
    .replace(/^-|-$/g, '')                             // trim -
    .slice(0, 80) || 'file'
}
