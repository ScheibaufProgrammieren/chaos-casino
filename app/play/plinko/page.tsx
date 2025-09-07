'use client';

import { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
import { formatUnits, parseUnits } from 'viem';
import { chaosCoinAbi, chaosPlinkoAbi } from '@/lib/abi';

const HUB_ADDRESS = process.env.NEXT_PUBLIC_HUB_ADDRESS as `0x${string}`;
const PLINKO_ADDRESS = process.env.NEXT_PUBLIC_PLINKO_ADDRESS as `0x${string}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

const RISK_LEVELS = [
    { name: 'Low', multipliers: [16, 11, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 11, 16] },
    { name: 'Medium', multipliers: [30, 15, 7, 4, 2, 1, 0.5, 0.4, 0.3, 0.4, 0.5, 1, 2, 4, 7, 15, 30] },
    { name: 'Chaos', multipliers: [100, 30, 5, 1, 0.5, 0.3, 0.2, 0, 0, 0, 0.2, 0.3, 0.5, 1, 5, 30, 100] },
];

const PlinkoBoard = forwardRef(({ riskLevel, onBallDrop }: { riskLevel: number, onBallDrop: () => number }, ref) => {
    const rows = 16;
    const multipliers = RISK_LEVELS[riskLevel].multipliers;
    const [balls, setBalls] = useState<{ id: number; path: { x: number; y: number }[]; outcomeBin: number }[]>([]);

    useImperativeHandle(ref, () => ({
        drop() {
            const outcomeBin = onBallDrop();
            if (outcomeBin === -1) return;

            let path = [{ x: 50, y: 2 }];
            let currentPathX = 50;

            for (let i = 0; i < rows; i++) {
                const rand = Math.random() - 0.5;
                currentPathX += rand * (100 / (i + 5));
                path.push({ x: currentPathX, y: 5.8 * (i + 1) });
            }

            const finalX = (100 / multipliers.length) * (outcomeBin + 0.5);
            path.push({ x: finalX, y: 97 });
            
            setBalls(prev => [...prev.slice(-10), { id: Date.now(), path, outcomeBin }]);
        }
    }));
    
    return (
        <div className="relative w-full aspect-square bg-gray-900/50 border border-white/10 rounded-2xl overflow-hidden p-4">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex justify-center" style={{ marginBottom: `calc(1.8% - 1px)` }}>
                    {Array.from({ length: i + 2 }).map((_, j) => (
                        <div key={j} className="h-2 w-2 bg-white/30 rounded-full" style={{ margin: `0 calc(2.4% - ${i*0.07}px)` }} />
                    ))}
                </div>
            ))}
            {balls.map(ball => <Ball key={ball.id} path={ball.path} onComplete={() => setBalls(b => b.filter(item => item.id !== ball.id))} />)}
            <div className="absolute bottom-0 left-0 w-full h-[6%] flex justify-center px-1">
                {multipliers.map((m, i) => {
                    const isDead = m === 0;
                    return (
                        <div key={i} className={`text-xs text-center font-bold h-full flex-1 flex items-center justify-center rounded-t-md mx-px transition-colors duration-300 ${isDead ? 'bg-rose-900/50 text-rose-400' : 'bg-gray-800/50'}`}>
                            {m}x
                        </div>
                    );
                })}
            </div>
        </div>
    );
});
PlinkoBoard.displayName = "PlinkoBoard";

const Ball = ({ path, onComplete }: { path: { x: number; y: number }[], onComplete: () => void }) => {
    const [position, setPosition] = useState(path[0]);
    useEffect(() => {
        path.forEach((pos, index) => {
            setTimeout(() => setPosition(pos), index * 150);
        });
        setTimeout(onComplete, path.length * 150 + 1000);
    }, [path, onComplete]);

    return <div className="absolute h-4 w-4 bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.8)]" style={{ left: `calc(${position.x}% - 8px)`, top: `calc(${position.y}% - 8px)`, transition: 'all 0.15s cubic-bezier(0.5, 0.1, 0.9, 0.8)' }} />;
}

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
                    Your Main Balance: {formatUnits(balance, 0)} Coins <br/>
                    Current Game Balance: {formatUnits(gameBalance, 0)} Coins
                </div>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full mt-4 rounded-xl border-white/10 bg-white/5 p-4 text-xl font-semibold outline-none ring-1 ring-inset ring-white/10" placeholder="0"/>
                <button onClick={() => onConfirm(amountAsBigInt)} disabled={!amount || amountAsBigInt === BigInt(0) || amountAsBigInt > maxAmount} className="btn-cta glow mt-6">Confirm {mode}</button>
            </div>
        </div>
    );
};

export default function PlinkoPage() {
    const { address } = useAccount();
    const [betAmount, setBetAmount] = useState<string>('1');
    const [riskLevel, setRiskLevel] = useState<number>(1);
    const [isModalOpen, setModalOpen] = useState<'deposit' | 'withdraw' | null>(null);
    const [localGameBalance, setLocalGameBalance] = useState<bigint>(BigInt(0));
    const plinkoBoardRef = useRef<{ drop: () => void }>(null);

    const { data: mainBalance, refetch: refetchMainBalance } = useReadContract({ address: HUB_ADDRESS, abi: chaosCoinAbi, functionName: 'getCoins', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address } });
    const { data: onChainGameBalance, refetch: refetchGameBalance } = useReadContract({ address: PLINKO_ADDRESS, abi: chaosPlinkoAbi, functionName: 'gameBalances', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address } });
    
    useEffect(() => {
        if (onChainGameBalance !== undefined) {
            setLocalGameBalance(onChainGameBalance);
        }
    }, [onChainGameBalance]);
    
    const { writeContractAsync, data: hash, reset } = useWriteContract();
    const { isLoading: isTxLoading, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash });

    const handleDeposit = async (amount: bigint) => {
        setModalOpen(null);
        toast.info('Sending deposit transaction...');
        try {
            await writeContractAsync({ address: PLINKO_ADDRESS, abi: chaosPlinkoAbi, functionName: 'deposit', args: [amount] });
        } catch (e) { toast.error('Transaction rejected.'); }
    };

    const handleWithdraw = async () => {
        toast.info('Sending withdraw transaction...');
        try {
            // --- THIS IS THE FIX ---
            await writeContractAsync({ address: PLINKO_ADDRESS, abi: chaosPlinkoAbi, functionName: 'withdrawAll', args: [] });
        } catch (e) { toast.error('Transaction rejected.'); }
    };

    const handleInstantDrop = () => {
        const bet = parseUnits(betAmount || '0', 0);
        if (localGameBalance < bet) {
            toast.error("Not enough in-game balance. Deposit more to continue.");
            return -1;
        }
        
        setLocalGameBalance(prev => prev - bet);
        
        const multipliers = RISK_LEVELS[riskLevel].multipliers;
        const outcomeBin = Math.floor(Math.random() * multipliers.length);
        const multiplier = multipliers[outcomeBin];
        const winnings = (bet * BigInt(Math.floor(multiplier * 100))) / BigInt(100);

        setTimeout(() => {
            if (winnings > BigInt(0)) {
                setLocalGameBalance(prev => prev + winnings);
                toast.success(`WIN! You won ${formatUnits(winnings, 0)} coins!`);
            } else {
                toast.error(`💥 OOF! You hit a dead bin.`);
            }
        }, 2500);
        
        return outcomeBin;
    };

    useEffect(() => {
        if (isTxSuccess) {
            toast.dismiss();
            toast.success('Transaction Confirmed!');
            refetchMainBalance();
            refetchGameBalance();
            reset();
        }
    }, [isTxSuccess, refetchMainBalance, refetchGameBalance, reset]);
    
    const betAmountAsBigInt = parseUnits(betAmount || '0', 0);
    
    return (
        <main className="mx-auto max-w-7xl px-6 py-12">
            <DepositWithdrawModal 
                isOpen={isModalOpen !== null}
                mode={isModalOpen!}
                onClose={() => setModalOpen(null)}
                balance={mainBalance ?? BigInt(0)}
                gameBalance={onChainGameBalance ?? BigInt(0)}
                onConfirm={isModalOpen === 'deposit' ? handleDeposit : handleWithdraw}
            />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <div className="lg-col-span-1 space-y-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6 sticky top-24">
                    <h2 className="text-2xl font-bold">Degen's Descent</h2>
                    <div className="p-4 rounded-lg bg-black/20 text-center">
                        <p className="text-sm text-white/60">Game Balance</p>
                        <p className="text-3xl font-bold">{formatUnits(localGameBalance, 0)}</p>
                        <div className="grid grid-cols-2 gap-2 mt-3">
                            <button onClick={() => setModalOpen('deposit')} className="btn-ghost">Deposit</button>
                            <button onClick={handleWithdraw} className="btn-ghost" disabled={isTxLoading || localGameBalance === BigInt(0)}>Withdraw</button>
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-white/80">Bet Amount</label>
                        <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} className="w-full mt-2 rounded-xl border-white/10 bg-white/5 p-4 text-xl font-semibold" min="1"/>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-white/80">Risk Level</label>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            <button onClick={() => setRiskLevel(0)} className={`choice ${riskLevel === 0 ? 'active' : ''}`}>Low</button>
                            <button onClick={() => setRiskLevel(1)} className={`choice ${riskLevel === 1 ? 'active' : ''}`}>Medium</button>
                            <button onClick={() => setRiskLevel(2)} className={`choice ${riskLevel === 2 ? 'active' : ''}`}>Chaos</button>
                        </div>
                    </div>
                    <button onClick={() => plinkoBoardRef.current?.drop()} disabled={isTxLoading || localGameBalance < betAmountAsBigInt} className="btn-cta glow">
                        Drop Ball
                    </button>
                </div>

                <div className="lg-col-span-2">
                    <PlinkoBoard ref={plinkoBoardRef} riskLevel={riskLevel} onBallDrop={handleInstantDrop} />
                </div>
            </div>
        </main>
    );
}
