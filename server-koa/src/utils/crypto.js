// 中文注释：ESM 工具方法
import crypto from 'node:crypto'
import fs from 'fs-extra'

/**
 * 计算文件的 MD5 哈希值
 * @param {string} filePath - 文件路径
 * @returns {Promise<string>} MD5 哈希值
 */
function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5')
    const stream = fs.createReadStream(filePath)

    stream.on('data', (data) => {
      hash.update(data)
    })

    stream.on('end', () => {
      resolve(hash.digest('hex'))
    })

    stream.on('error', reject)
  })
}

/**
 * 计算数据的 MD5 哈希值
 * @param {Buffer|string} data - 要计算哈希的数据
 * @returns {string} MD5 哈希值
 */
function calculateDataHash(data) {
  return crypto.createHash('md5').update(data).digest('hex')
}

/**
 * 生成唯一的上传ID
 * @returns {string} 上传ID
 */
function generateUploadId() {
  return crypto.randomBytes(16).toString('hex')
}

export { calculateFileHash, calculateDataHash, generateUploadId }
