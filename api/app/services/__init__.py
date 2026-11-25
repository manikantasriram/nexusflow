"""Business rules. Routers translate HTTP to and from these functions; these never see a Request.

Every function that reads or writes customer data takes the organization id (usually through a
`Tenant`) and filters on it. That one rule is what keeps organizations apart.
"""
