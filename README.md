<<<<<<< HEAD
# 智慧农林无人机虫害巡检网页终端

这是一个可部署的 FastAPI + 原生 HTML/CSS/JS 网页终端，用于演示无人机巡检查找虫害的完整闭环流程。当前版本不接真实无人机、不接真实大模型 API，检测模型和大模型分析均保留可替换接口，演示时使用本地样例图和模板化分析。

## 功能流程

1. 任务规划：框选巡检区域、设置定点间距，选择检测模型和大模型模板。
2. 无人机自主巡检：根据田块区域生成 S 型沿田垄巡航 spot。
3. 图像回传预处理：展示畸变校正、尺度归一化、光照增强流程。
4. 核心 AI 检测：展示小样本、ProtoFormerBridge、C2F 解码器等引擎说明。
5. 虫害检测与定位输出：输出虫种、Bounding Box、局部坐标和模拟 GPS。
6. 智能预警：按风险等级和虫害点触发预警。
7. 大模型智能分析：使用模板融合检测结果、趋势和防治建议，不调用真实 API。
8. 检测报告生成：在线浏览图表，支持 Word 导出和浏览器 PDF 打印。

## 目录结构

```text
backend/              FastAPI 接口、航线规划、检测模拟、报告模板
frontend/             单页网页终端、Canvas 任务地图、详情视图
frontend/assets/      200m x 200m 麦田航拍背景图
picture/raw/          待识别样例图
picture/labeled/      已标注输出图
picture/none/         无虫害样例图
uploads/              用户上传影像缓存
tests/                后端逻辑测试
```

## 本地运行

1. 安装依赖：

```bash
pip install -r requirements.txt
```

2. 可选配置：

```bash
copy .env.example .env
```

3. Windows 下启动前建议先确认 8000 端口没有旧服务。只保留一个 `uvicorn` 进程，避免一个 `127.0.0.1:8000` 和一个 `0.0.0.0:8000` 同时运行：

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

如果确认这些进程都是旧的本项目服务，可以结束对应 PID：

```powershell
Stop-Process -Id <PID> -Force
```

4. 启动服务：

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

本机调试也可以只绑定本地地址：

```bash
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

5. 浏览器访问：

```text
http://127.0.0.1:8000
```

## 当前检测规则

- `picture/none` 中的图片，或文件名以 `无虫害_` 开头：判定为无虫害并返回原图。
- `picture/raw/<filename>` 优先匹配 `picture/labeled/<filename>`。
- 若同名标注图不存在，则匹配 `picture/labeled/out_<filename>`。
- 虫害类型来自文件名：去掉扩展名、`out_` 前缀和末尾 `_数字`。

## API

- `GET /`：网页终端。
- `GET /api/config`：流程配置、模型列表、默认 GPS 原点、画布配置。
- `GET /api/samples`：样例图片列表。
- `POST /api/plan-route`：输入局部米制多边形和定点间距，输出 S 型 spot 与模拟 GPS。
- `POST /api/detect`：上传照片、spot、检测模型和大模型模板，输出检测结果和报告。
- `POST /api/detect-samples`：使用样例图 JSON 请求检测，绕开 multipart 上传，适合答辩演示。
- `GET /api/report/{session_id}`：获取指定批次报告。

## 测试

```bash
pytest
```
=======
# FCPI
系统实现农林虫害检测全流程闭环：①任务规划——农田网格化，设置飞行参数，灵活选择检测模型与大模型；②无人机S型沿田垄自主巡航，定点拍摄并回传图像，结合空间信息反推虫害位置；③图像实时回传并预处理（畸变校正、归一化、光照增强）；④AI检测引擎融合小样本学习与伪装目标检测，通过多粒度原型及ProtoFormerBridge记忆机制，仅需1–5样本即可适配新虫种，结合C2F解码器增强弱小目标识别；⑤输出虫种类别、边界框及GPS坐标，异常点实时标记；⑥设定阈值，虫害即触发告警，推送位置、种类与严重程度；⑦大模型结合历史数据预测虫害趋势与等级，生成防治建议；⑧生成可视化报告（空间分布、趋势、占比），支持在线浏览与导出。实现从“事后检测”向“主动预警”转变。
>>>>>>> 75563e99d57cd8f3041528e37c740a53441f7269
