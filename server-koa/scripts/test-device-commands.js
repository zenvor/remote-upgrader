#!/usr/bin/env node

// 中文注释：
// 用途：批量测试 /devices/{deviceId}/command 接口，覆盖所有支持的命令类型
// 说明：后端不会校验 command 名称的合法性，而是按原样转发给设备。
//      以下命令集合来源于后端 Swagger 注释与现有实现：
//      1) cmd:upgrade            升级设备，需携带包信息
//      2) cmd:rollback           降级设备，需携带项目类型
//      3) device:heartbeat       请求设备立即上报心跳
//      4) config:refresh-network 立即刷新网络信息
//   （补充）config:deploy-path   通常由专用接口设置，这里仅作为调试演示，不建议通过 command 接口调用

import axios from 'axios';

// 从环境变量或参数读取基础配置
const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
const deviceId = process.argv[2] || process.env.DEVICE_ID || 'device-001';

// 示例数据（可按需修改）
const defaultProject = process.argv[3] || 'frontend';
const defaultFileName = process.argv[4] || 'frontend-v1.0.0.zip';
const defaultVersion = process.argv[5] || 'v1.0.0';
const defaultDeployPath = process.argv[6] || '/opt/frontend';

// 定义全部可发送的命令（基于当前实现与文档）
const supportedCommands = [
  {
    name: 'cmd:upgrade',
    description: '升级设备（需要提供项目、文件名、可选版本与部署路径）',
    payload: {
      command: 'cmd:upgrade',
      data: {
        project: defaultProject,
        fileName: defaultFileName,
        version: defaultVersion,
        deployPath: defaultDeployPath
      }
    }
  },
  {
    name: 'cmd:rollback',
    description: '降级设备（需要提供项目类型）',
    payload: {
      command: 'cmd:rollback',
      data: {
        project: defaultProject
      }
    }
  },
  {
    name: 'device:heartbeat',
    description: '请求设备立即上报一次心跳',
    payload: {
      command: 'device:heartbeat',
      data: {}
    }
  },
  {
    name: 'config:refresh-network',
    description: '立即刷新网络信息（WiFi 名称/信号、IP 等）',
    payload: {
      command: 'config:refresh-network',
      data: {}
    }
  },
  // 非正式渠道：通常通过专用接口设置，这里仅用于调试
  {
    name: 'config:deploy-path',
    description: '设置原部署目录路径（通常不通过此接口，而是使用 /devices/{deviceId}/deploy-path）',
    payload: {
      command: 'config:deploy-path',
      data: { deployPath: defaultDeployPath }
    },
    experimental: true
  }
];

async function testSingleCommand(cmd) {
  const url = `${serverUrl}/devices/${encodeURIComponent(deviceId)}/command`;
  try {
    const res = await axios.post(url, cmd.payload, { timeout: 10000, validateStatus: () => true });
    const ok = res.status >= 200 && res.status < 300;
    console.log(`\n[${ok ? '✅' : '⚠️'}] ${cmd.name} - ${cmd.description}`);
    console.log(`请求: POST ${url}`);
    console.log(`请求体: ${JSON.stringify(cmd.payload)}`);
    console.log(`响应状态: ${res.status}`);
    console.log(`响应数据: ${JSON.stringify(res.data)}`);
  } catch (err) {
    console.log(`\n[❌] ${cmd.name} - 请求失败: ${err.message}`);
  }
}

async function testInvalidCases() {
  // 缺少 command 参数 → 期望 400
  const url = `${serverUrl}/devices/${encodeURIComponent(deviceId)}/command`;
  try {
    const res = await axios.post(url, { data: {} }, { timeout: 8000, validateStatus: () => true });
    console.log(`\n[校验] 缺少 command 参数`);
    console.log(`响应状态: ${res.status}（期望 400）`);
    console.log(`响应数据: ${JSON.stringify(res.data)}`);
  } catch (err) {
    console.log(`\n[校验] 缺少 command 参数 - 请求失败: ${err.message}`);
  }

  // 设备不存在或不在线 → 期望 404
  const unknownUrl = `${serverUrl}/devices/unknown-device-999/command`;
  try {
    const res = await axios.post(unknownUrl, { command: 'device:heartbeat', data: {} }, { timeout: 8000, validateStatus: () => true });
    console.log(`\n[校验] 设备不存在或不在线`);
    console.log(`响应状态: ${res.status}（期望 404）`);
    console.log(`响应数据: ${JSON.stringify(res.data)}`);
  } catch (err) {
    console.log(`\n[校验] 设备不存在或不在线 - 请求失败: ${err.message}`);
  }
}

async function main() {
  console.log('=== 设备命令接口测试 ===');
  console.log(`服务器地址: ${serverUrl}`);
  console.log(`设备ID: ${deviceId}`);
  console.log('\n支持的命令列表（将依次测试）：');
  supportedCommands.forEach((c, i) => {
    const tag = c.experimental ? '（调试/非常规）' : '';
    console.log(`${i + 1}. ${c.name} ${tag} - ${c.description}`);
  });

  for (const cmd of supportedCommands) {
    await testSingleCommand(cmd);
  }

  await testInvalidCases();

  console.log('\n测试结束。提示：如果设备离线或未注册，命令会返回 404。');
}

main().catch((e) => {
  console.error('测试执行失败:', e);
  process.exit(1);
});

