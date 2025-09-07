'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
import { decodeEventLog, formatUnits, parseUnits } from 'viem';
import { chaosCoinAbi, chaosPlinkoAbi } from '@/lib/abi';

const HUB_ADDRESS = process.env.NEXT_PUBLIC_HUB_ADDRESS as `0x${string}`;
const PLINKO_ADDRESS = process.env.NEXT_PUBLIC_PLINKO_ADDRESS as `0x${string}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

const RISK_LEVELS = [
    { name: 'Low', multipliers: [16, 11, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 11, 16] },
    { name: 'Medium', multipliers: [30, 15, 7, 4, 2, 1, 0.5, 0.4, 0.3, 0.4, 0.5, 1, 2, 4, 7, 15, 30] },
    { name: 'Chaos', multipliers: [100, 30, 5, 1, 0.5, 0.3, 0.2, 0, 0, 0, 0.2, 0.3, 0.5, 1, 5, 30, 100] },
];

const PlinkoBoard = ({ riskLevel, outcomeBin, onAnimationComplete }: { riskLevel: number, outcomeBin: number | null, onAnimationComplete: () => void }) => {
    const rows = 16;
    const multipliers = RISK_LEVELS[riskLevel].multipliers;
    const [ballPosition, setBallPosition] = useState<{ x: number, y: number } | null>(null);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        if (outcomeBin === null || isAnimating) return;

        setIsAnimating(true);
        
        let path: { x: number, y: number }[] = [{ x: 50, y: 2 }];
        let currentPegIndex = Math.floor(rows / 2);

        for (let i = 0; i < rows; i++) {
            const startX = 50 - (i * 2.5);
            let direction = Math.random() < 0.5 ? -1 : 1;
            
            const remainingRows = rows - i - 1;
            const minPossibleEnd = currentPegIndex - remainingRows;
            const maxPossibleEnd = currentPegIndex + remainingRows;
            if (maxPossibleEnd < outcomeBin) direction = 1;
            else if (minPossibleEnd > outcomeBin) direction = -1;

            if (direction === 1) currentPegIndex++;

            path.push({ x: startX + currentPegIndex * 5, y: 7 + i * 5.5 });
        }
        
        const finalX = (100 / (multipliers.length + 1)) * (outcomeBin + 1.5);
        path.push({ x: finalX, y: 100 });

        path.forEach((pos, index) => {
            setTimeout(() => {
                setBallPosition(pos);
                if (index === path.length - 1) {
                    setTimeout(() => {
                        setIsAnimating(false);
                        onAnimationComplete();
                    }, 500);
                }
            }, index * 150);
        });

    }, [outcomeBin, isAnimating, onAnimationComplete, rows, multipliers.length]);
    
    return (
        <div className="relative w-full aspect-[4/3] bg-gray-900/50 border border-white/10 rounded-2xl overflow-hidden p-4">
            {ballPosition && (
                <div className="absolute h-4 w-4 bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.8)] transition-all duration-100 ease-linear" 
                     style={{ left: `calc(${ballPosition.x}% - 8px)`, top: `calc(${ballPosition.y}% - 8px)` }}
                />
            )}
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex justify-center" style={{ marginBottom: 'calc(2.75% - 4px)'}}>
                    {Array.from({ length: i + 1 }).map((_, j) => (
                        <div key={j} className="h-2 w-2 bg-white/30 rounded-full" style={{ margin: '0 2.5%' }} />
                    ))}
                </div>
            ))}
            <div className="absolute bottom-0 left-0 w-full h-[8%] flex justify-center px-1">
                {multipliers.map((m, i) => {
                    const isDead = m === 0;
                    return (
                        <div key={i} className={`text-xs text-center font-bold h-full flex-1 flex items-center justify-center rounded-t-md mx-px transition-all duration-300
                            ${(isAnimating && outcomeBin === i) ? 'animate-pulse' : ''}
                            ${outcomeBin === i ? (isDead ? 'bg-rose-600' : 'bg-emerald-500') : (isDead ? 'bg-rose-900/50' : 'bg-gray-800/50')}
                        `}>
                            {m}x
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const DepositWithdrawModal = ({ mode, isOpen, onClose, onConfirm, balance, gameBalance }: { mode: 'deposit' | 'withdraw', isOpen: boolean, onClose: () => void, onConfirm: (amount: bigint) => void, balance: bigint, gameBalance: bigint }) => {
    if (!isOpen) return null;
    const [amount, setAmount] = useState('');
    const title = mode === 'deposit' ? 'Deposit to Game' : 'Withdraw from Game';
    const maxAmount = mode === 'deposit' ? balance : gameBalance;
    const amountAsBigInt = amount ? parseUnits(amount, 0) : BigInt(0);
    
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="relative max-w-sm w-full rounded-2xl bg-gray-900 p-6 ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-bold">{title}</h2>
                <div className="mt-4 text-sm text-white/60">
                    Your Balance: {formatUnits(balance, 0)} Coins <br/>
                    Game Balance: {formatUnits(gameBalance, 0)} Coins
                </div>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full mt-4 rounded-xl border-white/10 bg-white/5 p-4 text-xl font-semibold outline-none ring-1 ring-inset ring-white/10" placeholder="0"/>
                {/* --- THIS IS THE FIX --- */}
                <button onClick={() => onConfirm(amountAsBigInt)} disabled={!amount || amountAsBigInt === BigInt(0) || amountAsBigInt > maxAmount} className="btn-cta glow mt-6">Confirm {mode}</button>
            </div>
        </div>
    );
};

export default function PlinkoPage() {
    const { address } = useAccount();
    const [betAmount, setBetAmount] = useState<string>('1');
    const [riskLevel, setRiskLevel] = useState<number>(1);
    const [outcomeBin, setOutcomeBin] = useState<number | null>(null);
    const [isModalOpen, setModalOpen] = useState<'deposit' | 'withdraw' | null>(null);

    const { data: mainBalance, refetch: refetchMainBalance } = useReadContract({ address: HUB_ADDRESS, abi: chaosCoinAbi, functionName: 'getCoins', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address } });
    const { data: gameBalance, refetch: refetchGameBalance } = useReadContract({ address: PLINKO_ADDRESS, abi: chaosPlinkoAbi, functionName: 'gameBalances', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address } });
    
    const { writeContractAsync, data: hash, reset } = useWriteContract();
    const { isLoading, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });

    // --- THIS IS THE FIX ---
    const betAmountAsBigInt = betAmount ? parseUnits(betAmount, 0) : BigInt(0);
    const hasEnoughInGame = gameBalance ? gameBalance >= betAmountAsBigInt : false;

    async function handleTx(functionName: 'deposit' | 'withdraw' | 'dropBall', args: any[]) {
        try {
            await writeContractAsync({ address: PLINKO_ADDRESS, abi: chaosPlinkoAbi, functionName, args });
            toast.info('Sending transaction...');
            return true;
        } catch (e) {
            console.error(e);
            toast.error('Transaction rejected.');
            return false;
        }
    }

    async function handleDeposit(amount: bigint) {
        if (await handleTx('deposit', [amount])) setModalOpen(null);
    }
    async function handleWithdraw(amount: bigint) {
        if (await handleTx('withdraw', [amount])) setModalOpen(null);
    }
    async function handleDrop() {
        if (!hasEnoughInGame) { toast.error('Not enough in-game balance.'); return; }
        setOutcomeBin(null);
        await handleTx('dropBall', [betAmountAsBigInt, riskLevel]);
    }

    useEffect(() => {
        if (isSuccess && receipt) {
            toast.dismiss();
            toast.success('Transaction Confirmed!');
            
            refetchMainBalance();
            refetchGameBalance();
            
            let dropEvent;
            for (const log of receipt.logs) { try { const event = decodeEventLog({ abi: chaosPlinkoAbi, ...log }); if (event.eventName === 'BallDropped') { dropEvent = event; break; } } catch {} }
            
            if (dropEvent && dropEvent.args.outcomeBin !== undefined) {
                setOutcomeBin(dropEvent.args.outcomeBin);
            }
            
            reset();
        }
    }, [isSuccess, receipt, refetchMainBalance, refetchGameBalance, reset]);
    
    return (
        <main className="mx-auto max-w-7xl px-6 py-12">
            <DepositWithdrawModal 
                isOpen={isModalOpen !== null}
                mode={isModalOpen!}
                onClose={() => setModalOpen(null)}
                // --- THIS IS THE FIX ---
                balance={mainBalance ?? BigInt(0)}
                gameBalance={gameBalance ?? BigInt(0)}
                onConfirm={isModalOpen === 'deposit' ? handleDeposit : handleWithdraw}
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <div className="lg:col-span-1 space-y-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6 sticky top-24">
                    <div>
                        <h2 className="text-2xl font-bold">Degen's Descent</h2>
                        <p className="text-white/60 mt-1">On-chain Plinko. Instant drops. Provably fair chaos.</p>
                    </div>
                    <div className="p-4 rounded-lg bg-black/20 text-center">
                        <p className="text-sm text-white/60">Game Balance</p>
                        {/* --- THIS IS THE FIX --- */}
                        <p className="text-3xl font-bold">{formatUnits(gameBalance ?? BigInt(0), 0)}</p>
                        <div className="grid grid-cols-2 gap-2 mt-3">
                            <button onClick={() => setModalOpen('deposit')} className="btn-ghost">Deposit</button>
                            <button onClick={() => setModalOpen('withdraw')} className="btn-ghost">Withdraw</button>
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-white/80">Bet Amount (Coins)</label>
                        <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} className="w-full mt-2 rounded-xl border-white/10 bg-white/5 p-4 text-xl font-semibold outline-none ring-1 ring-inset ring-white/10" min="1" disabled={isLoading}/>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-white/80">Risk Level</label>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            <button onClick={() => setRiskLevel(0)} className={`choice ${riskLevel === 0 ? 'active' : ''}`} disabled={isLoading}>Low</button>
                            <button onClick={() => setRiskLevel(1)} className={`choice ${riskLevel === 1 ? 'active' : ''}`} disabled={isLoading}>Medium</button>
                            <button onClick={() => setRiskLevel(2)} className={`choice ${riskLevel === 2 ? 'active' : ''}`} disabled={isLoading}>Chaos</button>
                        </div>
                    </div>
                    <button onClick={handleDrop} disabled={isLoading || !hasEnoughInGame} className="btn-cta glow">
                        {isLoading ? 'Confirming...' : 'Drop Ball'}
                    </button>
                </div>

                <div className="lg:col-span-2">
                    <PlinkoBoard riskLevel={riskLevel} outcomeBin={outcomeBin} onAnimationComplete={() => {
                        if(receipt) {
                             let dropEvent;
                            for (const log of receipt.logs) { try { const event = decodeEventLog({ abi: chaosPlinkoAbi, ...log }); if (event.eventName === 'BallDropped') { dropEvent = event; break; } } catch {} }
                            if (dropEvent && dropEvent.args.coinsWon !== undefined) {
                                const { coinsWon } = dropEvent.args;
                                if (coinsWon === BigInt(0)) {
                                    toast.error('💥 UNLUCKY! You hit a dead bin.');
                                } else {
                                    toast.success(`WIN! You won ${formatUnits(coinsWon, 0)} coins back!`);
                                }
                            }
                        }
                        setOutcomeBin(null);
                    }} />
                </div>
            </div>
        </main>
    );
}
