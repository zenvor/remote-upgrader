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
    try {
      // 确保文件名正确编码（处理中文文件名）
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8')
      file.originalname = originalName

      console.log('📁 接收文件:', {
        原始名称: file.originalname,
        编码: file.encoding || 'utf8',
        大小: file.size || '未知'
      })

      // 验证文件类型
      const allowedExtensions = ['.zip', '.tar.gz', '.rar', '.7z']
      const fileName = file.originalname.toLowerCase()
      const isValidType = allowedExtensions.some((ext) => fileName.endsWith(ext))

      if (!isValidType) {
        cb(new Error('不支持的文件格式，请上传 .zip, .tar.gz, .rar, .7z 文件'), false)
        return
      }

      cb(null, true)
    } catch (error) {
      console.warn('文件名编码处理失败:', error.message)
      // 如果编码转换失败，仍然尝试使用原始文件名
      cb(null, true)
    }
  }
})

export default upload
