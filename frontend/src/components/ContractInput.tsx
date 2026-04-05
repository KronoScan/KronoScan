import type { ContractInput, ContractInputMode } from '../types'

const SAMPLE_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VulnerableVault {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok);
        balances[msg.sender] -= amount;
    }
}`

interface Props {
  value: ContractInput
  onChange: (input: ContractInput) => void
}

const CHAINS = ['Arc Testnet', 'Ethereum Mainnet', 'Base']

function isValidAddress(addr: string): boolean {
  return addr.startsWith('0x') && addr.length === 42
}

export function ContractInput({ value, onChange }: Props) {
  const setMode = (mode: ContractInputMode) => onChange({ ...value, mode })

  return (
    <div
      style={{
        background: 'white',
        borderRadius: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(8,145,178,0.08)',
        overflow: 'hidden',
      }}
    >
      {/* Top gradient accent line */}
      <div style={{
        height: 3,
        background: 'linear-gradient(90deg, #0891b2, #10b981)',
        borderRadius: '16px 16px 0 0',
      }} />

      {/* Tabs bar */}
      <div
        style={{
          background: '#f8f9ff',
          borderBottom: '1px solid #e8eaf6',
          display: 'flex',
        }}
      >
        {(['source', 'address'] as ContractInputMode[]).map(mode => (
          <button
            key={mode}
            type="button"
            onClick={() => setMode(mode)}
            style={{
              padding: '12px 20px',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              border: 'none',
              borderBottom: value.mode === mode ? '2px solid #0891b2' : '2px solid transparent',
              background: value.mode === mode ? 'white' : 'transparent',
              color: value.mode === mode ? '#0891b2' : '#94a3b8',
              boxShadow: value.mode === mode ? '0 1px 4px rgba(8,145,178,0.08)' : 'none',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              if (value.mode !== mode) e.currentTarget.style.color = '#64748b'
            }}
            onMouseLeave={e => {
              if (value.mode !== mode) e.currentTarget.style.color = '#94a3b8'
            }}
          >
            {mode === 'source' ? 'Paste Source' : 'On-Chain Address'}
          </button>
        ))}
      </div>

      <div style={{ padding: 0 }}>
        {value.mode === 'source' ? (
          <textarea
            rows={16}
            placeholder={SAMPLE_CONTRACT}
            value={value.source}
            onChange={e => onChange({ ...value, source: e.target.value })}
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: 340,
              background: '#0d1117',
              color: '#c9d1d9',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 13,
              lineHeight: 1.7,
              padding: '20px 20px 20px 16px',
              border: 'none',
              outline: 'none',
              resize: 'vertical',
              borderLeft: '3px solid #0891b2',
              display: 'block',
            }}
          />
        ) : (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                  fontSize: 14,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              >
                ⌕
              </span>
              <input
                type="text"
                placeholder="0x..."
                value={value.address}
                onChange={e => onChange({ ...value, address: e.target.value })}
                spellCheck={false}
                style={{
                  width: '100%',
                  background: 'white',
                  border: '1px solid #e8eaf6',
                  borderRadius: 8,
                  padding: '11px 12px 11px 32px',
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#1a1a2e',
                  outline: 'none',
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = '#0891b2'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(8,145,178,0.12)'
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = '#e8eaf6'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            <select
              value={value.chain}
              onChange={e => onChange({ ...value, chain: e.target.value })}
              style={{
                width: '100%',
                background: 'white',
                border: '1px solid #e8eaf6',
                borderRadius: 8,
                padding: '11px 12px',
                fontSize: 13,
                color: '#1a1a2e',
                outline: 'none',
              }}
            >
              {CHAINS.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {value.address.length > 0 && (
              isValidAddress(value.address) ? (
                <p style={{ fontSize: 12, color: '#16a34a' }}>
                  ✓ Will fetch verified source from block explorer
                </p>
              ) : (
                <p style={{ fontSize: 12, color: '#94a3b8' }}>
                  Enter a valid contract address
                </p>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
