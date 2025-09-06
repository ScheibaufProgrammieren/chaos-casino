'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';
import { decodeEventLog, formatUnits } from 'viem';

// Make sure to add chaosCascadeAbi to this import
import { chaosCoinAbi, chaosCascadeAbi } from '@/lib/abi'; 

const HUB_ADDRESS = process.env.NEXT_PUBLIC_HUB_ADDRESS as `0x${string}`;
const CASCADE_ADDRESS = process.env.NEXT_PUBLIC_CASCADE_ADDRESS as `0x${string}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

// This would be your visual component for the Plinko board
const CascadeBoard = () => {
    // We'll add the real visual later. For now, it's a placeholder.
    return <div className="h-[600px] w-full bg-gray-900/50 border border-white/10 rounded-lg flex items-center justify-center text-white/50">Plinko Board Visual Goes Here</div>;
};


export default function CascadePage() {
    const { address } = useAccount();
    const [betAmount, setBetAmount] = useState<string>('1');
    const [riskLevel, setRiskLevel] = useState<number>(0); // 0=Low, 1=Medium, 2=Chaos

    const { data: coins, refetch: refetchCoins } = useReadContract({ address: HUB_ADDRESS, abi: chaosCoinAbi, functionName: 'getCoins', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address } });
    const { data: pendingWinnings, refetch: refetchWinnings } = useReadContract({ address: CASCADE_ADDRESS, abi: chaosCascadeAbi, functionName: 'pendingWinnings', args: [address ?? ZERO_ADDRESS], query: { enabled: !!address, refetchInterval: 2000 } });

    const { writeContractAsync: dropBallAsync, data: dropHash, reset: resetDrop } = useWriteContract();
    const { isLoading: isDropping, isSuccess: isDropConfirmed, data: dropReceipt } = useWaitForTransactionReceipt({ hash: dropHash });

    const { writeContractAsync: collectAsync, data: collectHash, reset: resetCollect } = useWriteContract();
    const { isLoading: isCollecting, isSuccess: isCollectConfirmed } = useWaitForTransactionReceipt({ hash: collectHash });

    const betAmountAsBigInt = BigInt(Number(betAmount) || 0);
    const hasEnoughCoins = coins ? coins >= betAmountAsBigInt : false;

    async function handleDropBall() {
        if (!hasEnoughCoins) { toast.error('Not enough coins for this bet.'); return; }
        
        try {
            await dropBallAsync({
                address: CASCADE_ADDRESS,
                abi: chaosCascadeAbi,
                functionName: 'dropBall',
                args: [betAmountAsBigInt, riskLevel],
            });
        } catch (e) {
            console.error(e);
            toast.error('Transaction rejected.');
        }
    }

    async function handleCollect() {
        const toastId = toast.loading('Sending transaction to collect winnings...');
        try {
            await collectAsync({
                address: CASCADE_ADDRESS,
                abi: chaosCascadeAbi,
                functionName: 'collectWinnings',
            });
             toast.loading('Waiting for confirmation...', { id: toastId });
        } catch (e) {
            console.error(e);
            toast.error('Transaction rejected.', { id: toastId });
        }
    }

    useEffect(() => {
        if (isDropConfirmed && dropReceipt) {
            let dropEvent;
            for (const log of dropReceipt.logs) {
                try { const event = decodeEventLog({ abi: chaosCascadeAbi, ...log }); if (event.eventName === 'BallDropped') { dropEvent = event; break; } } catch {}
            }
            if (dropEvent) {
                const { pointsWon } = dropEvent.args;
                if (pointsWon === BigInt(0)) {
                    toast.error('💥 CHAOS! Your pending winnings have been wiped!');
                } else {
                    toast.success(`+${formatUnits(pointsWon, 0)} points added to your pot!`);
                }
            }
            refetchCoins();
            resetDrop();
        }
    }, [isDropConfirmed, dropReceipt, refetchCoins, resetDrop]);

    useEffect(() => {
        if (isCollectConfirmed) {
            toast.dismiss();
            toast.success('Winnings collected successfully!');
            refetchWinnings();
            resetCollect();
        }
    }, [isCollectConfirmed, refetchWinnings, resetCollect]);

    const isActionDisabled = isDropping || isCollecting;

    return (
        <main className="mx-auto max-w-7xl px-6 py-12">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                {/* Left Side - Controls */}
                <div className="lg:col-span-1 space-y-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6 sticky top-24">
                    <div>
                        <h2 className="text-2xl font-bold">Chaos Cascade</h2>
                        <p className="text-white/60 mt-1">Push your luck. How long can you last?</p>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-white/80">Bet Amount (Coins)</label>
                        <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} className="w-full mt-2 rounded-xl border-white/10 bg-white/5 p-4 text-xl font-semibold outline-none ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-white" min="1" disabled={isActionDisabled}/>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-white/80">Risk Level</label>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            <button onClick={() => setRiskLevel(0)} className={`choice ${riskLevel === 0 ? 'active' : ''}`} disabled={isActionDisabled}>Low</button>
                            <button onClick={() => setRiskLevel(1)} className={`choice ${riskLevel === 1 ? 'active' : ''}`} disabled={isActionDisabled}>Medium</button>
                            <button onClick={() => setRiskLevel(2)} className={`choice ${riskLevel === 2 ? 'active' : ''}`} disabled={isActionDisabled}>Chaos</button>
                        </div>
                    </div>
                    <button onClick={handleDropBall} disabled={isActionDisabled || !hasEnoughCoins} className="btn-cta glow">
                        {isDropping ? 'Dropping...' : 'Drop Ball'}
                    </button>
                    <hr className="border-white/10" />
                    <div className="text-center">
                        <p className="text-sm text-white/70">Pending Winnings</p>
                        <p className="text-4xl font-extrabold text-amber-300 mt-1">{pendingWinnings ? formatUnits(pendingWinnings, 0) : '0'}</p>
                        <button onClick={handleCollect} disabled={isActionDisabled || !pendingWinnings || pendingWinnings === 0n} className="btn-cta success mt-4">
                            {isCollecting ? 'Collecting...' : 'Collect Winnings'}
                        </button>
                    </div>
                </div>

                {/* Right Side - Board */}
                <div className="lg:col-span-2">
                    <CascadeBoard />
                </div>
            </div>
        </main>
    );
}
