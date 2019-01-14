import React, { Component } from "react";
import {
  NativeModules,
  View,
  Modal,
  Text,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
  Image,
  Alert,
  Platform,
  Linking,
  ImageBackground,
  StatusBar,
  ToastAndroid,
  ScrollView
} from "react-native";

const { RNUpdateApp } = NativeModules;
const RNFS = require("react-native-fs");
const { width, height } = Dimensions.get("window");
const isIOS = Platform.OS == "ios";

class RNUpdate extends Component {
  // 定义默认属性
  static defaultProps = {
    progressBarColor: "#f50",
    updateBoxWidth: 250,
    updateBoxHeight: 250,
    updateBtnHeight: 38,
    updateBtnText: "立即更新",
    theme: 1,
    bannerWidth: 250,
    bannerHeight: 120,
    bannerResizeMode: "contain",
    successTips: "", // 包下载成功的提示
    errorTips: "", // 下载发生错误的提示
    CancelTips: "", // 用户取消升级的提示
    bannerImage: require("./theme/1/banner.png"),
    closeImage: require("./theme/1/close.png"),
    fileSizeLabel: "文件大小：",
    changeLogLabel: "升级说明：",
    downloading: "下载中",
    install: "安装",
    alreadyLatest: "已经是最新版本",
    installFail: "安装失败",
    onCancelUpdate: () => {} // 取消升级
  };

  constructor(props) {
    super(props);
    this.state = {
      progress: 0,
      modalVisible: false,
      desc: [], //更新说明
      fileSize: -1
    };

    this.jobId = 0; // 下载任务的id，用来停止下载
    this.fetchRes = {}; // 远程请求更新的json数据

    this.loading = false; // 是否在下载中

    this.filePath = "";
  }

  async componentWillMount() {
    if (this.props.onBeforeStart) {
      let res = await this.props.onBeforeStart();
      this.checkUpdate(res);
    }
  }

  reset() {
    this.setState({
      progress: 0,
      modalVisible: false,
      desc: [], //更新说明
      fileSize: -1
    });

    this.jobId = 0; // 下载任务的id，用来停止下载
    this.fetchRes = {}; // 远程请求更新的json数据

    this.loading = false; // 是否在下载中
  }

  checkUpdate = (fetchRes, isManual) => {
    try {
      this.md5 = fetchRes.md5;
      this.force = fetchRes.forceUpgrade;
      this.fetchRes = fetchRes;
      let { version, desc, build } = fetchRes;
      let { alreadyLatest } = this.props;
      // 安装包下载目录

      if (!Array.isArray(desc)) {
        desc = [desc];
      }

      if (build > RNUpdateApp.buildVersion) {
        try {
          RNUpdateApp.getFileSize(this.fetchRes.url).then(async fileSize => {
            fileSize = Number(fileSize / 1024 / 1024).toFixed(2, 10);

            this.setState({
              modalVisible: true,
              desc,
              fileSize
            });
          });
        } catch (e) {
          this.setState({
            modalVisible: true,
            desc
          });
        }
      } else {
        if (isManual) {
          ToastAndroid.show(
            alreadyLatest,
            ToastAndroid.SHORT,
            ToastAndroid.BOTTOM
          );
        }
      }
    } catch (e) {
      console.warn("check update error", e);
    }
  };

  errorTips = () => {
    let { installFail } = this.props;
    ToastAndroid.show(installFail, ToastAndroid.SHORT, ToastAndroid.BOTTOM);
  };

  androidUpdate = async () => {
    let _this = this;
    const { url, filename, version } = this.fetchRes;
    // 按照目录/包名/文件名 存放，生成md5文件标识

    this.filePath = `${RNFS.ExternalDirectoryPath}/${filename}${version}.apk`;

    // 检查包是否已经下载过，如果有，则直接安装
    let exist = await RNFS.exists(this.filePath);
    if (exist) {
      let md5 = await RNFS.hash(this.filePath, "md5");
      if (md5 === this.md5) {
        RNUpdateApp.install(this.filePath);
      } else {
        let ret = RNFS.unlink(this.filePath);
      }
      if (!this.force) this.hideModal();
      return;
    }

    // 下载apk并安装
    RNFS.downloadFile({
      fromUrl: url,
      toFile: this.filePath,
      progressDivider: 2, // 节流
      begin(res) {
        _this.jobId = res.jobId; // 设置jobId，用于暂停和恢复下载任务
        this.loading = true;
      },
      progress(res) {
        let progress = (res.bytesWritten / res.contentLength).toFixed(2, 10);
        // 此处 this 指向有问题，需要使用 _this
        _this.setState({
          progress
        });
      }
    })
      .promise.then(response => {
        // 下载完成后
        if (!this.force) this.hideModal();
        RNFS.hash(this.filePath, "md5")
          .then(md5 => {
            if (response.statusCode == 200 && md5 === this.md5) {
              // console.log("FILES UPLOADED!") // response.statusCode, response.headers, response.body
              RNUpdateApp.install(this.filePath);
            } else {
              // 提示安装失败，关闭升级窗口
              RNFS.unlink(this.filePath)
                .then(() => {})
                .catch(() => {});
              this.errorTips();
            }
          })
          .catch(e => {
            this.errorTips();
          })
          .finally(() => {
            this.loading = false;
          });
      })
      .catch(err => {
        if (err.description == "cancegetFileSizelled") {
          this.errorTips();
        }
        this.hideModal();
      });
  };

  updateApp = () => {
    // 如果已经开始下载
    if (this.loading) return;
    // 如果是android
    if (!isIOS) {
      this.androidUpdate();
      return;
    }

    let { url } = this.fetchRes;
    // 如果是ios，打开appstore连接
    Linking.openURL(url).catch(err => console.warn("An error occurred", err));
  };

  // stopUpdateApp = () => {
  //     this.jobId && RNFS.stopDownload(this.jobId)
  // }

  hideModal = () => {
    this.setState({
      modalVisible: false
    });

    if (this.props.onCancelUpdate) {
      this.props.onCancelUpdate();
    }

    this.jobId && RNFS.stopDownload(this.jobId);
  };

  componentWillUnmount() {
    this.hideModal();
  }

  renderBottom = () => {
    let { progress } = this.state;
    let {
      progressBarColor,
      updateBtnHeight,
      updateBoxWidth,
      updateBtnText,
      downloading,
      install
    } = this.props;
    if (progress > 0 && progress < 1) {
      return (
        <View style={styles.progressBar}>
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              backgroundColor: progressBarColor,
              height: 3,
              width: progress * updateBoxWidth
            }}
          />
          <Text style={styles.updateBtnText}>
            {downloading}
            {parseInt(progress * 100, 10)}%
          </Text>
        </View>
      );
    }
    return (
      <TouchableOpacity onPress={this.updateApp}>
        <View style={styles.updateBtn}>
          <Text style={styles.updateBtnText}>
            {progress == 1 ? install : updateBtnText}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  renderCloseBtn = () => {
    let { closeImage, updateBoxWidth, updateBoxHeight } = this.props;
    return (
      <View
        style={{
          position: "absolute",
          right: (width - updateBoxWidth) / 2 - 16,
          top: (height - updateBoxHeight) / 2 - 16,
          zIndex: 1,
          width: 32,
          height: 32,
          backgroundColor: "#e6e6e6",
          borderRadius: 16
        }}
      >
        <TouchableOpacity
          onPress={this.hideModal}
          style={{
            width: 32,
            height: 32,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <Image source={closeImage} style={{ width: 20, height: 20 }} />
        </TouchableOpacity>
      </View>
    );
  };

  renderBanner = () => {
    let {
      bannerImage,
      bannerWidth,
      bannerHeight,
      bannerResizeMode
    } = this.props;
    return (
      <View style={{ height: bannerHeight }}>
        <Image
          style={{
            width: bannerWidth,
            height: bannerHeight,
            resizeMode: bannerResizeMode
          }}
          source={bannerImage}
        />
      </View>
    );
  };

  renderFileSize = () => {
    let { fileSize } = this.state;
    let { fileSizeLabel } = this.props;
    if (!isIOS) {
      return (
        <Text>
          {fileSizeLabel}
          {fileSize}M
        </Text>
      );
    }
  };

  render() {
    let { modalVisible, progress, desc } = this.state;
    let { updateBoxWidth, updateBoxHeight, changeLogLabel } = this.props;
    return (
      <Modal
        animationType={"fade"}
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {}}
      >
        <View style={styles.wrap}>
          {!this.force ? this.renderCloseBtn() : null}
          <View
            style={[
              styles.innerBox,
              { width: updateBoxWidth, height: updateBoxHeight }
            ]}
          >
            {this.renderBanner()}
            <View style={{ width: updateBoxWidth, height: 85 }}>
              <ScrollView style={{ paddingLeft: 10, paddingRight: 10 }}>
                {this.renderFileSize()}
                <Text>{changeLogLabel}</Text>
                {desc &&
                  desc.map((d, i) => {
                    return <Text key={i}>{i + 1 + ". " + d}</Text>;
                  })}
              </ScrollView>
            </View>
            {this.renderBottom()}
          </View>
        </View>
      </Modal>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)"
  },
  innerBox: {
    backgroundColor: "#fff",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#eee",
    overflow: "hidden"
  },
  updateBtn: {
    borderTopWidth: 1,
    borderTopColor: "#eee",
    width: 250,
    height: 38,
    alignItems: "center",
    justifyContent: "center"
  },
  updateBtnText: {
    fontSize: 13,
    color: "#f50"
  },
  progressBar: {
    borderTopWidth: 1,
    borderTopColor: "#eee",
    width: 250,
    height: 37,
    alignItems: "center",
    justifyContent: "center"
  }
});

export default RNUpdate;
