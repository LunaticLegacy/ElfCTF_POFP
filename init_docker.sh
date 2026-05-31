docker run -it \
  --name pofpctf-sandbox-3 \
  -v "$PWD":/challenge \
  -w /challenge \
  -p 8000:8000 \
  pofpctf-sandbox:latest \
  bash
