import fitz  # PyMuPDF
from paddleocr import PaddleOCR
import numpy as np
from PIL import Image

# Install libraries
# pip install paddlepaddle-gpu
# pip install paddleocr pymupdf

ocr_engine = PaddleOCR(
    use_textline_orientation=True,
    lang="en",  # TODO: add language detection
    ocr_version="PP-OCRv4",  # TODO: try if v5 works
    device="gpu",
    text_det_limit_side_len=960,
    text_recognition_batch_size=6
)

def pdf_to_text(pdf_path):
    doc = fitz.open(pdf_path)
    full_document_content = []

    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        
        # If there is a text layer - extract it
        digital_text = page.get_text().strip()
        if len(digital_text) > 50:
            full_document_content.append(f"[Page {page_num+1} - Digital]\n{digital_text}")
            continue

        # OCR
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # Increase resolution
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        img_array = np.array(img)

        #  OCR
        result = ocr_engine.predict(input=img_array)

        if result[0]:
            page_text = "\n".join([line[1][0] for line in result[0]])
            full_document_content.append(f"[Page {page_num+1} - OCR]\n{page_text}")
        else:
            full_document_content.append(f"[Page {page_num+1}] - No text detected.")

    return "\n\n".join(full_document_content)
