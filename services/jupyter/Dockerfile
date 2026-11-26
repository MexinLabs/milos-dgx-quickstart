# JupyterLab on top of the NGC PyTorch container (multi-arch: amd64 and arm64).
ARG BASE_IMAGE=nvcr.io/nvidia/pytorch:26.11-py3
FROM ${BASE_IMAGE}

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

WORKDIR /workspace
EXPOSE 8888
# The access token comes from the JUPYTER_TOKEN environment variable.
CMD ["jupyter", "lab", "--ip=0.0.0.0", "--port=8888", "--no-browser", "--allow-root", "--notebook-dir=/workspace/notebooks"]
