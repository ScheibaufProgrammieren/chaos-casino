'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'sonner';

import { chaosCoinAbi } from '@/lib/abi';

const HUB_ADDRESS = process.env.NEXT_PUBLIC_HUB_ADDRESS as `0x${string}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

// --- THE PRIZE CATALOG ---
const PRIZES = [
    {
        name: 'Diamond Hands NFT',
        cost: 1000,
        image: '/diamond-nft.png',
        description: 'A symbol of your unwavering conviction. Purely for the flex.'
    },
    {
        name: 'Chaos Chrono Watch',
        cost: 5000,
        image: '/rolex.png',
        description: 'A timepiece that bends reality. They will know you are a winner.'
    },
    {
        name: 'Hyper-Dimensional Lambo',
        cost: 25000,
        image: '/lambo.png',
        description: 'Forget the moon. This is for cruising between galaxies.'
    }
];

export default function RewardsPage() {
    const { isConnected, address } = useAccount();
    const [toastId, setToastId] = useState<string | number | undefined>(undefined);

    const { data: points } = useReadContract({
        address: HUB_ADDRESS,
        abi: chaosCoinAbi,
        functionName: 'points',
        args: [address ?? ZERO_ADDRESS],
        query: { enabled: !!address, refetchInterval: 5000 },
    });

    const { writeContractAsync, data: hash, reset } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

    async function handleRedeem(amount: number, prizeName: string) {
        if (!isConnected || !points || BigInt(amount) > points) {
            toast.error('You do not have enough points for this prize.');
            return;
        }

        const id = toast.loading(`Redeeming points for a ${prizeName}...`);
        setToastId(id);

        try {
            await writeContractAsync({
                address: HUB_ADDRESS,
                abi: chaosCoinAbi,
                functionName: 'redeemPoints',
                args: [BigInt(amount)],
            });
            toast.loading('Waiting for on-chain confirmation...', { id });
        } catch (e) {
            toast.error('Transaction rejected.', { id });
        }
    }

    useEffect(() => {
        if (isConfirmed && toastId) {
            toast.success('Redemption Successful! Your legend grows.', { id: toastId });
            reset();
            setToastId(undefined);
            // We don't need to refetch points here, wagmi's cache will update automatically.
        }
    }, [isConfirmed, toastId, reset]);

    return (
        <main className="mx-auto max-w-7xl px-6 py-12">
            <div className="text-center">
                <h1 className="text-4xl font-extrabold">The Rewards Vault</h1>
                <p className="mt-2 text-white/60">Burn your points for ultimate status. This is the endgame.</p>
                <div className="mt-4 text-lg text-white/80">
                    Your Points Balance: <span className="font-bold text-indigo-400">{points ? points.toString() : '0'}</span>
                </div>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {PRIZES.map((prize) => {
                    const hasEnoughPoints = points ? points >= BigInt(prize.cost) : false;
                    return (
                        <div key={prize.name} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
                            <div className="flex-grow">
                                <img src={prize.image} alt={prize.name} className="h-48 w-full object-contain" />
                                <h2 className="mt-6 text-2xl font-bold">{prize.name}</h2>
                                <p className="mt-2 text-sm text-white/60">{prize.description}</p>
                            </div>
                            <div className="mt-6">
                                <p className="text-lg font-bold text-indigo-400">{prize.cost.toLocaleString()} Points</p>
                                <button
                                    onClick={() => handleRedeem(prize.cost, prize.name)}
                                    disabled={!isConnected || !hasEnoughPoints || isConfirming}
                                    className="btn-cta glow mt-4"
                                >
                                    {isConfirming ? 'Confirming...' : 'Redeem Now'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </main>
    );
}
