#!/usr/bin/env node

import fs from 'fs';
import FormData from 'form-data';
import axios from 'axios';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

/**
 * 测试直接上传接口
 */
async function testDirectUpload() {
  console.log('=== 测试直接上传接口 ===');
  
  try {
    // 创建一个测试文件
    const testContent = 'This is a test ZIP file content for direct upload';
    const testFileName = 'test-direct-upload.zip';
    const testFilePath = `/tmp/${testFileName}`;
    
    // 写入测试文件
    fs.writeFileSync(testFilePath, testContent);
    console.log(`创建测试文件: ${testFilePath}`);
    console.log(`文件大小: ${testContent.length} 字节`);
    
    // 创建 FormData
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testFilePath), testFileName);
    formData.append('project', 'frontend');
    
    console.log(`\n发送上传请求到: ${SERVER_URL}/upload/direct`);
    console.log('项目类型: frontend');
    console.log('文件名: ', testFileName);
    
    // 发送请求
    const response = await axios.post(`${SERVER_URL}/upload/direct`, formData, {
      headers: {
        ...formData.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        console.log(`上传进度: ${percentCompleted}%`);
      }
    });
    
    console.log('\n✅ 上传成功!');
    console.log('响应状态:', response.status);
    console.log('响应数据:', JSON.stringify(response.data, null, 2));
    
    // 清理测试文件
    fs.unlinkSync(testFilePath);
    console.log('\n清理测试文件完成');
    
  } catch (error) {
    console.error('\n❌ 上传失败:');
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    } else {
      console.error('错误信息:', error.message);
      console.error('错误详情:', error);
    }
  }
}

/**
 * 测试路由可用性
 */
async function testRoutes() {
  console.log('=== 测试路由可用性 ===');
  
  const routes = [
    { url: `${SERVER_URL}/`, method: 'GET', desc: '根路径' },
    { url: `${SERVER_URL}/packages`, method: 'GET', desc: '包列表' },
    { url: `${SERVER_URL}/api-docs`, method: 'GET', desc: 'Swagger UI' },
    { url: `${SERVER_URL}/swagger.json`, method: 'GET', desc: 'OpenAPI 规范' },
  ];
  
  for (const route of routes) {
    try {
      const response = await axios({
        method: route.method,
        url: route.url,
        timeout: 5000,
        validateStatus: () => true // 接受所有状态码
      });
      
      console.log(`${route.desc}: ${route.url} - 状态: ${response.status}`);
      
      if (response.status === 404) {
        console.log('  ⚠️  路由不存在');
      } else if (response.status >= 200 && response.status < 300) {
        console.log('  ✅ 路由正常');
      } else {
        console.log('  ⚠️  路由存在但返回错误状态');
      }
      
    } catch (error) {
      console.log(`${route.desc}: ${route.url} - 错误: ${error.message}`);
    }
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('远程升级系统 - 直接上传测试工具');
  console.log('======================================');
  console.log(`服务器地址: ${SERVER_URL}`);
  
  // 先测试路由
  await testRoutes();
  
  console.log('\n');
  
  // 再测试上传
  await testDirectUpload();
}

main().catch(console.error);
