/// The sample vulnerable contract used for the demo.
/// Intentionally contains vulnerabilities across multiple categories.
/// Pre-written findings in findings.ts reference specific lines in this contract.
export const SAMPLE_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract VulnerableVault {
    address public owner;
    IERC20 public token;
    mapping(address => uint256) public balances;
    mapping(address => bool) public authorized;
    uint256 public totalDeposits;
    uint256 public feePercent = 5;
    bool public paused;

    event Deposit(address user, uint256 amount);
    event Withdrawal(address user, uint256 amount);

    constructor(address _token) {
        owner = msg.sender;
        token = IERC20(_token);
    }

    // LINE 23 — Missing access control: anyone can set fee
    function setFeePercent(uint256 _fee) external {
        feePercent = _fee;
    }

    // LINE 28 — Missing zero-address check
    function setOwner(address _newOwner) external {
        require(msg.sender == owner, "Not owner");
        owner = _newOwner;
    }

    function deposit(uint256 amount) external {
        require(!paused, "Paused");
        token.transferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;
        totalDeposits += amount;
        emit Deposit(msg.sender, amount);
    }

    // LINE 41 — Reentrancy: state updated after external call
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient");
        uint256 fee = amount * feePercent / 100;
        uint256 payout = amount - fee;
        token.transfer(msg.sender, payout);
        token.transfer(owner, fee);
        balances[msg.sender] -= amount;
        totalDeposits -= amount;
        emit Withdrawal(msg.sender, amount);
    }

    // LINE 52 — Division before multiplication (precision loss)
    function calculateReward(uint256 amount, uint256 rate) public pure returns (uint256) {
        return amount / 1000 * rate;
    }

    // LINE 57 — Unchecked return value on transfer
    function emergencyTransfer(address to, uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        token.transfer(to, amount);
    }

    // LINE 63 — No event emitted for critical state change
    function pause() external {
        require(msg.sender == owner, "Not owner");
        paused = true;
    }

    function unpause() external {
        require(msg.sender == owner, "Not owner");
        paused = false;
    }

    // LINE 72 — Uses tx.origin instead of msg.sender
    function authorizeUser(address user) external {
        require(tx.origin == owner, "Not owner");
        authorized[user] = true;
    }

    // LINE 78 — Unbounded loop: gas DoS if array grows
    function batchTransfer(address[] calldata recipients, uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        for (uint256 i = 0; i < recipients.length; i++) {
            token.transfer(recipients[i], amount);
        }
    }

    // LINE 85 — Magic number, unclear intent
    function isWhale(uint256 amount) public pure returns (bool) {
        return amount > 1000000000000000000000;
    }

    // LINE 90 — Using old Solidity pattern, should use custom errors
    function adminWithdraw(uint256 amount) external {
        require(msg.sender == owner, "Not owner");
        require(amount <= address(this).balance, "Insufficient ETH");
        payable(owner).transfer(amount);
    }
}`;

/// Total number of lines in the sample contract
export const SAMPLE_CONTRACT_LINES = SAMPLE_CONTRACT.split("\n").length;
