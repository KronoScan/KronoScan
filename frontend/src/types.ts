export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface AuditFinding {
  severity: Severity
  title: string
  line: number
  description: string
  category: string
}

export type SessionStatus = 'IDLE' | 'OPENING' | 'ACTIVE' | 'CLOSING' | 'CLOSED' | 'TERMINATED'

export type ContractInputMode = 'source' | 'address'

export interface ContractInput {
  mode: ContractInputMode
  source: string
  address: string
  chain: string
}
