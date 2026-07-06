"""
PDF parsing utilities
"""
import PyPDF2
from io import BytesIO
import logging

logger = logging.getLogger(__name__)


class PDFParser:
    """Parse PDF files and extract text"""
    
    def parse_pdf(self, pdf_file):
        """
        Extract text from PDF file
        
        Args:
            pdf_file: Django UploadedFile object
        
        Returns:
            str: Extracted text from PDF
        """
        try:
            # Read PDF
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            
            text = ""
            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
            
            return text.strip()
        
        except Exception as e:
            logger.error(f"Error parsing PDF: {str(e)}")
            raise ValueError(f"Failed to parse PDF: {str(e)}")
    
    def extract_sections(self, text):
        """
        Extract common sections from CV/LinkedIn text
        
        Args:
            text: Raw text from PDF
        
        Returns:
            dict: Extracted sections
        """
        sections = {
            'experience': '',
            'education': '',
            'skills': '',
            'summary': ''
        }
        
        text_lower = text.lower()
        
        # Simple heuristic section extraction
        # Find Experience section
        if 'experience' in text_lower:
            exp_idx = text_lower.index('experience')
            # Find next section or end
            next_sections = [
                text_lower.find('education', exp_idx),
                text_lower.find('skills', exp_idx),
                text_lower.find('certification', exp_idx),
                len(text)
            ]
            next_idx = min([i for i in next_sections if i > exp_idx])
            sections['experience'] = text[exp_idx:next_idx]
        
        # Find Skills section
        if 'skill' in text_lower:
            skill_idx = text_lower.index('skill')
            next_sections = [
                text_lower.find('experience', skill_idx),
                text_lower.find('education', skill_idx),
                text_lower.find('certification', skill_idx),
                len(text)
            ]
            next_idx = min([i for i in next_sections if i > skill_idx])
            sections['skills'] = text[skill_idx:next_idx]
        
        return sections
