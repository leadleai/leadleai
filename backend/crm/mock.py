"""Mock CRM adapter — fixed sample leads, no network. For testing the flow now."""
from typing import List

from .base import CrmAdapter, NormalizedLead

# (external_id, name, phone, email, company, enquiry, status)
_SAMPLE = [
    ("mock-1", "Shanker Gupta", "+919829056898", "ravi@example.com", "Dynamo Electric", "Wants a demo of the product", "new"),
    ("mock-2", "Aman Gupta", "+919602586039", "ravi@example.com", "Dynamo Electric", "I want to know about the automation", "new"),
    ("mock-3", "Arnav Gupta", "+918955149775", "ravi@example.com", "SaleScale.ai", "Wants a demo of the product", "new"),
    ("mock-4", "Priya Nair", "+910000000004", "priya@example.com", "Nair Interiors", "Interested in pricing for 500 leads", "new"),
    ("mock-5", "Rohit Mehta", "+910000000005", "rohit@example.com", "Mehta Consulting", "How does the AI calling work?", "contacted"),
    ("mock-6", "Sneha Rao", "+910000000006", "sneha@example.com", "Rao Textiles", "Wants to book a meeting next week", "interested"),
]


class MockCrmAdapter(CrmAdapter):
    provider = "mock"

    def is_ready(self) -> bool:
        return True

    async def fetch_leads(self) -> List[NormalizedLead]:
        return [
            NormalizedLead(
                external_id=ext, name=name, phone=phone, email=email,
                company=company, enquiry=enquiry, status=status,
            )
            for (ext, name, phone, email, company, enquiry, status) in _SAMPLE
        ]
