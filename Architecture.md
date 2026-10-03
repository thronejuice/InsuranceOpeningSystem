┌─────────────────────────────────────────────┐
│                  Angular                    │
│                                             │
│  Login                                      │
│  Dashboard                                  │
│  Customer                                   │
│  Insurance Job                              │
│  Quotation                                  │
│  Policy                                     │
│  Renewal                                    │
│  Reports                                    │
└──────────────────┬──────────────────────────┘
                   │
                   │ REST API / JSON
                   ▼
┌─────────────────────────────────────────────┐
│                  NestJS                     │
│                                             │
│  Auth Module                                │
│  Customer Module                            │
│  Insurance Job Module                       │
│  Quotation Module                           │
│  Policy Module                              │
│  Renewal Module                             │
│  Document Module                            │
│  Notification Module                       │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│                PostgreSQL                   │
│                                             │
│ Customer                                    │
│ Jobs                                        │
│ Quotations                                  │
│ Policies                                    │
│ Renewals                                    │
│ Documents                                   │
│ Activities                                  │
└─────────────────────────────────────────────┘