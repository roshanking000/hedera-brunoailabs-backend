const { receiveAllowancedNfts, sendNfts, claimReward } = require('../chainAction');

const StakedNfts = require('../../models/stakedNfts')
const RewardInfo = require('../../models/rewardInfo')

const NFT_COUNT = 193;

exports.stakeNewNfts = async (req_, res_) => {
    try {
        if (!req_.body.accountId || !req_.body.nftList)
            return res_.send({ result: false, error: 'Invalid post data!' });

        const _accountId = req_.body.accountId;
        const _nftList = JSON.parse(req_.body.nftList);

        const _tsxResult = await receiveAllowancedNfts(_accountId, _nftList);
        if (!_tsxResult)
            return res_.send({ result: false, error: 'Error! The transaction was rejected, or failed! Please try again!' });

        let _newStakedNft
        for (let i = 0; i < _nftList.length; i++) {
            _newStakedNft = new StakedNfts({
                accountId: _accountId,
                token_id: _nftList[i].token_id,
                serial_number: _nftList[i].serial_number,
                imageUrl: _nftList[i].imageUrl,
                name: _nftList[i].name
            });
            await _newStakedNft.save();
        }

        // add reward info
        const _oldRewardInfo = await RewardInfo.findOne({ accountId: _accountId });
        if (!_oldRewardInfo) {
            const _newRewardInfo = new RewardInfo({
                accountId: _accountId,
                stakedNftCount: _nftList.length
            });
            await _newRewardInfo.save();
        }
        else {
            await RewardInfo.findOneAndUpdate(
                { accountId: _accountId },
                {
                    stakedNftCount: _oldRewardInfo.stakedNftCount + _nftList.length
                }
            );
        }

        setDaysTimeout(stakeTimerOut, 1, _newStakedNft._id);

        return res_.send({ result: true, data: "NFTs successfully staked!" });
    } catch (error) {
        return res_.send({ result: false, error: 'Error detected in server progress!' });
    }
}

exports.loadStakeRatio = async (req_, res_) => {
    try {
        const _stakedNfts = await StakedNfts.find({});

        return res_.send({ result: true, data: { stakeRatio: _stakedNfts.length / NFT_COUNT * 100, mintedNFTCount: _stakedNfts.length, totalNFTCount: NFT_COUNT } });
    } catch (error) {
        return res_.send({ result: false, error: 'Error detected in server progress!' });
    }
}

exports.loadStakedNfts = async (req_, res_) => {
    try {
        if (!req_.query.accountId)
            return res_.send({ result: false, error: 'Invalid post data!' });

        const _accountId = req_.query.accountId;

        const _stakedNfts = await StakedNfts.find({ accountId: _accountId });

        let _stakedNftInfo = [];
        for (let i = 0; i < _stakedNfts.length; i++) {
            console.log("loadStakedNfts log - 2 : ", parseInt((Date.now() - _stakedNfts[i].createdAt) / 86400000));
            let _stakedDays = parseInt((Date.now() - _stakedNfts[i].createdAt) / 86400000);

            _stakedNftInfo.push({
                token_id: _stakedNfts[i].token_id,
                serial_number: _stakedNfts[i].serial_number,
                imageUrl: _stakedNfts[i].imageUrl,
                name: _stakedNfts[i].name,
                stakedDays: _stakedDays
            })
        }

        // get reward amount
        let _amount = 0
        const _rewardData = await RewardInfo.findOne({ accountId: _accountId })
        if (_rewardData)
            _amount = _rewardData.amount

        return res_.send({ result: true, data: { nftData: _stakedNftInfo, reward: _amount } });
    } catch (error) {
        return res_.send({ result: false, error: 'Error detected in server progress!' });
    }
}

exports.unstakeNftList = async (req_, res_) => {
    try {
        if (!req_.body.accountId)
            return res_.send({ result: false, error: 'Invalid post data!' });

        const _accountId = req_.body.accountId;
        const _nftList = JSON.parse(req_.body.nftList);

        const tsxResult = await sendNfts(_accountId, _nftList);
        if (!tsxResult)
            return res_.send({ result: false, error: 'Error! The transaction was rejected, or failed! Please try again!' });

        for (let i = 0; i < _nftList.length; i++)
            await StakedNfts.findOneAndDelete({ accountId: _accountId, token_id: _nftList[i].token_id, serial_number: _nftList[i].serial_number });
        
        const _rewardInfo = await RewardInfo.findOne({ accountId: _accountId })
        if (_rewardInfo) {
            await RewardInfo.findOneAndUpdate(
                { accountId: _accountId },
                { stakedNftCount: _rewardInfo.stakedNftCount - 1 }
            )
        }

        return res_.send({ result: true, data: "Unstake success!" });
    } catch (error) {
        return res_.send({ result: false, error: 'Error detected in server progress!' });
    }
}

exports.claimReward = async (req_, res_) => {
    try {
        if (!req_.query.accountId)
            return res_.send({ result: false, error: 'Invalid get data!' });

        const _accountId = req_.query.accountId;

        const _rewardInfo = await RewardInfo.findOne({ accountId: _accountId });
        if (!_rewardInfo || _rewardInfo.amount === 0)
            return res_.send({ result: false, error: "No reward!" });

        const tsxResult = await claimReward(_accountId, _rewardInfo.amount);
        if (!tsxResult)
            return res_.send({ result: false, error: 'Error! The transaction was rejected, or failed! Please try again!' });

        return res_.send({ result: true, data: _rewardInfo.amount });
    } catch (error) {
        return res_.send({ result: false, error: 'Error detected in server progress!' });
    }
}

exports.setClaimReward = async (req_, res_) => {
    try {
        if (!req_.body.accountId)
            return res_.send({ result: false, error: 'Invalid post data!' });

        const _accountId = req_.body.accountId;

        const _rewardInfo = await RewardInfo.findOne({ accountId: _accountId });
        if (!_rewardInfo)
            return res_.send({ result: false, error: "Invalid user!" });
        await RewardInfo.findOneAndUpdate(
            { accountId: _accountId },
            { amount: 0 }
        )
        return res_.send({ result: true });
    } catch (error) {
        return res_.send({ result: false, error: 'Error detected in server progress!' });
    }
}

const stakeTimerOut = async (id_) => {
    console.log(id_);
    // check existing
    const _findStakedNftInfo = await StakedNfts.findOne({ _id: id_ });
    if (_findStakedNftInfo === null) return;

    await StakedNfts.findOneAndUpdate(
        { _id: id_ },
        { stakedDays: _findStakedNftInfo.stakedDays + 1 }
    )

    const _rewardInfo = await RewardInfo.findOne({ accountId: _findStakedNftInfo.accountId });
    console.log(_rewardInfo.amount);

    await RewardInfo.findOneAndUpdate(
        { accountId: _findStakedNftInfo.accountId },
        { amount: _rewardInfo.amount + 1 }
    );
    setDaysTimeout(stakeTimerOut, 1, id_);
}

function setDaysTimeout(callback, days, id_) {
    // 86400 seconds in a day
    let msInDay = 86400*1000;
    // let msInDay = 5 * 1000;

    let dayCount = 0;
    let timer = setInterval(function () {
        dayCount++;  // a day has passed

        if (dayCount === days) {
            clearInterval(timer);
            callback(id_);
        }
    }, msInDay);
}

const initStakeTimer = async () => {
    console.log(Date.now())
    const _findStakedNftInfo = await StakedNfts.find({}).sort({ accountId: -1 });
    for (let i = 0; i < _findStakedNftInfo.length; i++) {
        const _count = Math.floor((Date.now() - _findStakedNftInfo[i].createdAt) / 86400000);
        const _remainTime = (Date.now() - _findStakedNftInfo[i].createdAt) % 86400000;

        await StakedNfts.findOneAndUpdate(
            { _id: _findStakedNftInfo[i]._id },
            { stakedDays: _count }
        )

        setTimeout(stakeTimerOut, _remainTime, _findStakedNftInfo[i]._id);
    }
}

initStakeTimer();