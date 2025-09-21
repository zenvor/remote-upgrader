import CryptoJS from 'crypto-js'

/**
 * 文件和分片 MD5 计算工具
 */

/**
 * 计算文件的完整 MD5 值
 * @param {File} file - 要计算的文件
 * @param {Function} onProgress - 进度回调函数 (progress: number) => void
 * @returns {Promise<string>} MD5 哈希值
 */
export async function calculateFileMD5(file, onProgress = null) {
  return new Promise((resolve, reject) => {
    const chunkSize = 2 * 1024 * 1024 // 2MB 分块读取
    const chunks = Math.ceil(file.size / chunkSize)
    let currentChunk = 0

    const hash = CryptoJS.algo.MD5.create()
    const fileReader = new FileReader()

    const loadNextChunk = () => {
      const start = currentChunk * chunkSize
      const end = Math.min(start + chunkSize, file.size)

      fileReader.readAsArrayBuffer(file.slice(start, end))
    }

    fileReader.addEventListener('load', function (event) {
      try {
        const arrayBuffer = event.target.result
        const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer)
        hash.update(wordArray)

        currentChunk++

        // 更新进度
        if (onProgress) {
          const progress = (currentChunk / chunks) * 100
          onProgress(Math.min(progress, 100))
        }

        if (currentChunk < chunks) {
          // 继续读取下一块
          loadNextChunk()
        } else {
          // 完成计算
          const md5Hash = hash.finalize().toString(CryptoJS.enc.Hex)
          resolve(md5Hash)
        }
      } catch (error) {
        reject(error)
      }
    })

    fileReader.onerror = function (error) {
      reject(error)
    }

    // 开始读取第一块
    loadNextChunk()
  })
}

/**
 * 计算数据块（Blob）的 MD5 值
 * @param {Blob} blob - 要计算的数据块
 * @returns {Promise<string>} MD5 哈希值
 */
export async function calculateBlobMD5(blob) {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader()

    fileReader.addEventListener('load', function (event) {
      try {
        const arrayBuffer = event.target.result
        const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer)
        const md5Hash = CryptoJS.MD5(wordArray).toString(CryptoJS.enc.Hex)
        resolve(md5Hash)
      } catch (error) {
        reject(error)
      }
    })

    fileReader.onerror = function (error) {
      reject(error)
    }

    fileReader.readAsArrayBuffer(blob)
  })
}

/**
 * 使用 Web Worker 计算大文件 MD5（避免阻塞主线程）
 * @param {File} file - 要计算的文件
 * @param {Function} onProgress - 进度回调函数
 * @returns {Promise<string>} MD5 哈希值
 */
export async function calculateFileMD5WithWorker(file, onProgress = null) {
  // 检查是否支持 Web Worker
  if (typeof Worker === 'undefined') {
    // 降级到主线程计算
    return calculateFileMD5(file, onProgress)
  }

  return new Promise((resolve, reject) => {
    // 创建内联 Worker
    const workerScript = `
      importScripts('https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js');
      
      self.onmessage = function(e) {
        const { fileBuffer, chunkSize } = e.data;
        
        try {
          const hash = CryptoJS.algo.MD5.create();
          const chunks = Math.ceil(fileBuffer.byteLength / chunkSize);
          
          for (let i = 0; i < chunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, fileBuffer.byteLength);
            const chunk = fileBuffer.slice(start, end);
            const wordArray = CryptoJS.lib.WordArray.create(chunk);
            hash.update(wordArray);
            
            // 发送进度更新
            const progress = ((i + 1) / chunks) * 100;
            self.postMessage({ type: 'progress', progress: Math.min(progress, 100) });
          }
          
          const md5Hash = hash.finalize().toString(CryptoJS.enc.Hex);
          self.postMessage({ type: 'complete', hash: md5Hash });
        } catch (error) {
          self.postMessage({ type: 'error', error: error.message });
        }
      };
    `

    const blob = new Blob([workerScript], { type: 'application/javascript' })
    const worker = new Worker(URL.createObjectURL(blob))

    // 读取整个文件到内存（对于大文件可能需要优化）
    const reader = new FileReader()
    reader.addEventListener('load', function (event) {
      worker.postMessage({
        fileBuffer: event.target.result,
        chunkSize: 2 * 1024 * 1024 // 2MB
      })
    })

    worker.onmessage = function (event) {
      const { type, progress, hash, error } = event.data

      if (type === 'progress' && onProgress) {
        onProgress(progress)
      } else if (type === 'complete') {
        worker.terminate()
        URL.revokeObjectURL(blob)
        resolve(hash)
      } else if (type === 'error') {
        worker.terminate()
        URL.revokeObjectURL(blob)
        reject(new Error(error))
      }
    }

    worker.onerror = function (error) {
      worker.terminate()
      URL.revokeObjectURL(blob)
      reject(error)
    }

    reader.readAsArrayBuffer(file)
  })
}

/**
 * 验证文件 MD5 值
 * @param {File} file - 要验证的文件
 * @param {string} expectedMD5 - 期望的 MD5 值
 * @param {Function} onProgress - 进度回调函数
 * @returns {Promise<boolean>} 验证结果
 */
export async function verifyFileMD5(file, expectedMD5, onProgress = null) {
  try {
    const actualMD5 = await calculateFileMD5(file, onProgress)
    return actualMD5.toLowerCase() === expectedMD5.toLowerCase()
  } catch (error) {
    console.error('MD5 验证失败:', error)
    return false
  }
}
