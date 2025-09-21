// 中文注释：ESM 导入
import multer from '@koa/multer'

// 自定义存储引擎，用于处理直接上传
const storage = multer.memoryStorage() // 使用内存存储，手动控制文件保存

const upload = multer({
  storage,
  limits: {
    fileSize: Number.parseInt(process.env.MAX_FILE_SIZE) || 524_288_000 // 限制文件最大大小，默认 500MB
  },
  fileFilter(request, file, cb) {
    // 验证文件类型
    const allowedExtensions = ['.zip', '.tar.gz', '.rar', '.7z']
    const fileName = file.originalname.toLowerCase()
    const isValidType = allowedExtensions.some((ext) => fileName.endsWith(ext))

    if (!isValidType) {
      cb(new Error('不支持的文件格式，请上传 .zip, .tar.gz, .rar, .7z 文件'), false)
      return
    }

    cb(null, true)
  }
})

export default upload
