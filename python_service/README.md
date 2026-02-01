# 🤖 Python AI Service - Local Image Classification

خدمة Python محلية لتحليل الصور باستخدام HuggingFace Transformers - **مجاني بالكامل، بدون قيود!**

## ✅ المميزات

- ✅ **مجاني 100%** - بدون أي تكاليف
- ✅ **يعمل محلياً** - لا يحتاج إنترنت بعد تحميل النموذج
- ✅ **بدون قيود** - لا حدود للطلبات
- ✅ **خصوصية عالية** - كل شيء على جهازك
- ✅ **سريع** - بعد التحميل الأول

## 📋 المتطلبات

- Python 3.11 أو أحدث
- 4GB RAM على الأقل (لتحميل النموذج)
- ~350MB مساحة تخزين (لتحميل النموذج)

## 🚀 الإعداد السريع

### Windows:

```bash
cd backend/python_service
start_service.bat
```

### Linux/Mac:

```bash
cd backend/python_service
chmod +x start_service.sh
./start_service.sh
```

### يدوياً:

```bash
# إنشاء بيئة افتراضية
python -m venv venv

# تفعيل البيئة
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# تثبيت المكتبات
pip install -r requirements.txt

# تشغيل الخدمة
python image_classifier.py
```

## ⚙️ الإعداد في Node.js Backend

في ملف `.env`:

```env
# تفعيل Python AI Service
USE_PYTHON_AI=true

# عنوان الخدمة (افتراضي: http://localhost:5000)
PYTHON_SERVICE_URL=http://localhost:5000

# اختياري: تغيير النموذج
HF_MODEL=google/vit-base-patch16-224
```

## 📊 النماذج المدعومة

يمكنك استخدام أي نموذج تصنيف صور من HuggingFace:

- `google/vit-base-patch16-224` (افتراضي - 346MB)
- `microsoft/resnet-18` (أصغر - ~45MB)
- `apple/mobilevit-small` (محسّن للهواتف)
- `google/vit-base-patch16-224-in21k` (أفضل دقة)

## 🔍 API Endpoints

### Health Check
```
GET http://localhost:5000/health
```

### Classify Image (File Upload)
```
POST http://localhost:5000/classify
Content-Type: multipart/form-data
Body: image file
```

### Classify Image (URL)
```
POST http://localhost:5000/classify_url
Content-Type: application/json
Body: { "url": "https://..." }
```

## 📝 ملاحظات

- عند التشغيل الأول، سيتم تحميل النموذج (~346MB) - قد يستغرق بضع دقائق
- النموذج يُحفظ محلياً في `~/.cache/huggingface/` - لن تحتاج تحميله مرة أخرى
- الخدمة تعمل على Port 5000 افتراضياً

## 🐛 حل المشاكل

### خطأ PyTorch DLL (Windows):
```
OSError: [WinError 1114] A dynamic link library (DLL) initialization routine failed
```

**الحل:**
```bash
# تشغيل سكريبت الإصلاح
fix_pytorch.bat

# أو يدوياً:
pip uninstall torch torchvision
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
```

**أو تثبيت Visual C++ Redistributable:**
- تحميل من: https://aka.ms/vs/17/release/vc_redist.x64.exe
- تثبيت وإعادة تشغيل

### الخدمة لا تبدأ:
- تأكد من تثبيت Python 3.11+
- تأكد من تثبيت جميع المكتبات: `pip install -r requirements.txt`
- على Windows: جرب `fix_pytorch.bat` أولاً

### Node.js لا يتصل بالخدمة:
- تأكد من تشغيل الخدمة: `python image_classifier.py`
- تأكد من Port 5000 متاح
- تحقق من `PYTHON_SERVICE_URL` في `.env`

### النموذج لا يُحمّل:
- تحقق من اتصال الإنترنت (للتحميل الأول فقط)
- تأكد من وجود مساحة كافية (~350MB)

